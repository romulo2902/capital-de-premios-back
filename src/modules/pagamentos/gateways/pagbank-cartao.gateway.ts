import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PaymentGateway,
  CriarCobrancaInput,
  CriarCobrancaOutput,
  ConsultarCobrancaOutput,
  StatusCobrancaGateway,
} from './payment-gateway.interface';

/**
 * Mapeia status de cobrança de cartão do PagBank para status interno normalizado.
 *
 * Referência: https://dev.pagbank.uol.com.br/reference/status-de-cobran%C3%A7as
 */
const STATUS_MAP: Record<string, StatusCobrancaGateway> = {
  WAITING: 'PENDENTE',
  IN_ANALYSIS: 'PENDENTE',
  PAID: 'APROVADO',
  AVAILABLE: 'APROVADO',
  DECLINED: 'CANCELADO',
  CANCELED: 'CANCELADO',
  REFUNDED: 'CANCELADO',
  IN_DISPUTE: 'PENDENTE',
};

interface PagBankTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface PagBankCharge {
  id: string;
  status: string;
  paid_at?: string;
  amount: {
    value: number;
    currency: string;
  };
  payment_response?: {
    code: string;
    message: string;
    reference: string;
  };
  [key: string]: unknown;
}

interface PagBankOrderResponse {
  id: string;
  charges: PagBankCharge[];
  links?: Array<{ rel: string; href: string }>;
  [key: string]: unknown;
}

/**
 * Gateway de Cartão de Crédito via PagBank.
 *
 * Fluxo esperado:
 * 1. O frontend tokeniza os dados do cartão usando o PagBank.js ou SDK mobile.
 * 2. O token (`cardToken`) é enviado no DTO de criação de venda.
 * 3. Este gateway usa o token para criar a cobrança na API PagBank.
 *
 * Documentação: https://dev.pagbank.uol.com.br/reference/cobrar-com-cart%C3%A3o
 */
@Injectable()
export class PagBankCartaoGateway implements PaymentGateway {
  private readonly logger = new Logger(PagBankCartaoGateway.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>(
      'PAGBANK_API_URL',
      'https://sandbox.api.pagseguro.com',
    );
    this.clientId = this.config.get<string>('PAGBANK_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('PAGBANK_CLIENT_SECRET', '');
  }

  private get directToken(): string | undefined {
    return this.config.get<string>('PAGBANK_TOKEN');
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    if (!input.cardToken) {
      throw new BadRequestException(
        'Token do cartão (cardToken) é obrigatório para pagamento por cartão de crédito. ' +
          'Gere o token usando o SDK PagBank no frontend antes de enviar a requisição.',
      );
    }

    const token = await this.obterToken();
    const parcelas = input.installments ?? 1;

    const body = {
      reference_id: input.vendaId,
      customer: {
        name: input.nomePagador,
        tax_id: input.cpfPagador.replace(/\D/g, ''),
      },
      items: [
        {
          name: input.descricao,
          quantity: 1,
          unit_amount: input.valorCentavos,
        },
      ],
      charges: [
        {
          reference_id: input.vendaId,
          description: input.descricao,
          amount: {
            value: input.valorCentavos,
            currency: 'BRL',
          },
          payment_method: {
            type: 'CREDIT_CARD',
            installments: parcelas,
            capture: true,
            card: {
              encrypted: input.cardToken,
              store: false,
            },
          },
        },
      ],
      notification_urls: [], // configurado via dashboard PagBank
    };

    this.logger.log(
      `Criando cobrança Cartão PagBank: vendaId=${input.vendaId} valor=${input.valorCentavos}¢ parcelas=${parcelas}x`,
    );

    const response = await this.request<PagBankOrderResponse>(
      'POST',
      '/orders',
      token,
      body,
    );

    const charge = response.charges?.[0];

    if (!charge) {
      throw new Error(
        'PagBank não retornou charge na criação do pedido de cartão',
      );
    }

    if (charge.status === 'DECLINED') {
      const reason =
        charge.payment_response?.message ?? 'Cartão recusado pelo emissor';
      this.logger.warn(
        `Cartão recusado: chargeId=${charge.id} reason=${reason}`,
      );
      throw new BadRequestException(`Pagamento recusado: ${reason}`);
    }

    this.logger.log(
      `Cobrança Cartão criada: chargeId=${charge.id} status=${charge.status} orderId=${response.id}`,
    );

    // Link de redirecionamento 3DS (se exigido pelo emissor)
    const url3ds = response.links?.find((l) => l.rel === '3DS')?.href;

    return {
      gatewayId: charge.id,
      urlPagamento: url3ds,
      payload: response as unknown as Record<string, unknown>,
    };
  }

  async consultarCobranca(
    gatewayId: string,
  ): Promise<ConsultarCobrancaOutput> {
    const token = await this.obterToken();

    const response = await this.request<PagBankCharge>(
      'GET',
      `/charges/${gatewayId}`,
      token,
    );

    const status = STATUS_MAP[response.status] ?? 'PENDENTE';
    const paidAt =
      status === 'APROVADO' && response.paid_at
        ? new Date(response.paid_at)
        : undefined;

    return {
      status,
      paidAt,
      payload: response as unknown as Record<string, unknown>,
    };
  }

  async cancelarCobranca(gatewayId: string): Promise<void> {
    const token = await this.obterToken();

    await this.request(
      'POST',
      `/charges/${gatewayId}/cancel`,
      token,
      { amount: { value: 0 } }, // PagBank exige body; amount 0 = valor total
    );

    this.logger.log(`Cobrança Cartão cancelada: chargeId=${gatewayId}`);
  }

  // ─── Helpers ───────────────────────────────────────────

  private async obterToken(): Promise<string> {
    const now = Date.now();

    if (this.directToken) {
      return this.directToken;
    }

    if (this.cachedToken && this.tokenExpiresAt > now) {
      return this.cachedToken;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
    });

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const response = await this.requestRaw<PagBankTokenResponse>(
      'POST',
      '/oauth2/token',
      `Basic ${credentials}`,
      params.toString(),
      'application/x-www-form-urlencoded',
    );

    this.cachedToken = response.access_token;
    // Margem de segurança de 60 segundos
    this.tokenExpiresAt = now + (response.expires_in - 60) * 1000;

    this.logger.log('Token OAuth2 do PagBank (Cartão) obtido com sucesso');
    return this.cachedToken;
  }

  private async request<T>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    const authHeader = this.directToken === token ? token : `Bearer ${token}`;
    return this.requestRaw<T>(method, path, authHeader, body);
  }

  private async requestRaw<T>(
    method: string,
    path: string,
    authorization: string,
    body?: unknown,
    contentType = 'application/json',
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      Authorization: authorization,
      Accept: 'application/json',
    };

    const requestBody =
      typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Erro na API PagBank (Cartão): ${method} ${path} → ${response.status}: ${errorBody}`,
      );
      throw new Error(
        `API PagBank retornou ${response.status}: ${errorBody}`,
      );
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
