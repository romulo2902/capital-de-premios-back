import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  PaymentGateway,
  CriarCobrancaInput,
  CriarCobrancaOutput,
  ConsultarCobrancaOutput,
  StatusCobrancaGateway,
} from './payment-gateway.interface';

/**
 * Mapeia status de cobrança do PagBank para status interno normalizado.
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

interface PagBankQrCode {
  id: string;
  text: string;
  expiration_date: string;
  links: Array<{ rel: string; href: string; media: string; type: string }>;
}

interface PagBankCharge {
  id: string;
  status: string;
  paid_at?: string;
  amount: {
    value: number;
    currency: string;
  };
  [key: string]: unknown;
}

interface PagBankOrderResponse {
  id: string;
  charges: PagBankCharge[];
  qr_codes?: PagBankQrCode[];
  [key: string]: unknown;
}

@Injectable()
export class PagBankPixGateway implements PaymentGateway {
  private readonly logger = new Logger(PagBankPixGateway.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly pixKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>(
      'PAGBANK_API_URL',
      'https://sandbox.api.pagseguro.com',
    );
    this.clientId = this.config.get<string>('PAGBANK_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('PAGBANK_CLIENT_SECRET', '');
    this.pixKey = this.config.get<string>('PAGBANK_PIX_KEY', '');
  }

  private get directToken(): string | undefined {
    return this.config.get<string>('PAGBANK_TOKEN');
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    const token = await this.obterToken();
    const expiracaoMinutos = Math.ceil(
      (input.expiracaoSegundos ?? 1800) / 60,
    );
    const expiracao = new Date(
      Date.now() + (input.expiracaoSegundos ?? 1800) * 1000,
    ).toISOString();

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
      qr_codes: [
        {
          amount: { value: input.valorCentavos },
          expiration_date: expiracao,
        },
      ],
      notification_urls: [], // configurado via dashboard PagBank
    };

    this.logger.log(
      `Criando cobrança PIX PagBank: vendaId=${input.vendaId} valor=${input.valorCentavos}¢ expiracao=${expiracaoMinutos}min`,
    );

    const response = await this.request<PagBankOrderResponse>(
      'POST',
      '/orders',
      token,
      body,
    );

    const charge = response.charges?.[0];
    const qrCode = response.qr_codes?.[0];

    if (!charge) {
      throw new Error('PagBank não retornou charge na criação do pedido PIX');
    }

    this.logger.log(
      `Cobrança PIX criada: chargeId=${charge.id} orderId=${response.id}`,
    );

    // Link da imagem do QR Code
    const qrImageLink = qrCode?.links?.find(
      (l) => l.rel === 'QRCODE.PNG' || l.media?.includes('image'),
    )?.href;

    return {
      gatewayId: charge.id,
      pixCopiaECola: qrCode?.text,
      qrCodeBase64: qrImageLink, // URL da imagem (não base64 nativo — renderizar via <img src>)
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

    this.logger.log(`Cobrança PIX cancelada: chargeId=${gatewayId}`);
  }

  // ─── Helpers ───────────────────────────────────────────

  private async obterToken(): Promise<string> {
    const now = Date.now();

    // Se houver um token direto no .env, usa ele sem prefixo Bearer (ou conforme a necessidade da API)
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

    this.logger.log('Token OAuth2 do PagBank obtido com sucesso');
    return this.cachedToken;
  }

  private async request<T>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    // Se for o token direto, geralmente o PagBank espera sem o prefixo "Bearer" ou com ele.
    // Para a API de Orders/Charges com Token de API, o padrão é o token puro ou Bearer.
    // Vamos usar Bearer se for o token cacheado (OAuth) e o token puro se for o do .env,
    // ou simplesmente testar o que o PagBank Sandbox aceita melhor.
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
        `Erro na API PagBank: ${method} ${path} → ${response.status}: ${errorBody}`,
      );
      throw new Error(
        `API PagBank retornou ${response.status}: ${errorBody}`,
      );
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
