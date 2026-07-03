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
  reference_id: string;
  charges?: PagBankCharge[];
  qr_codes?: PagBankQrCode[];
  [key: string]: unknown;
}

type PagBankOrderRequest = {
  reference_id: string;
  customer: {
    name: string;
    email?: string;
    tax_id: string;
    phones?: Array<{
      country: string;
      area: string;
      number: string;
      type: 'MOBILE';
    }>;
  };
  items: Array<{
    reference_id: string;
    name: string;
    quantity: number;
    unit_amount: number;
  }>;
  qr_codes: Array<{
    amount: { value: number };
    expiration_date?: string;
  }>;
  notification_urls?: string[];
};

type PagBankCustomerPhone = NonNullable<
  PagBankOrderRequest['customer']['phones']
>[number];

@Injectable()
export class PagBankPixGateway implements PaymentGateway {
  private readonly logger = new Logger(PagBankPixGateway.name);

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
    const token = await this.obterToken();
    const expiracaoMinutos = Math.ceil((input.expiracaoSegundos ?? 1800) / 60);
    const expiracao = new Date(
      Date.now() + (input.expiracaoSegundos ?? 1800) * 1000,
    ).toISOString();
    const quantidadeItens = Math.max(1, input.quantidadeItens ?? 1);
    const valorUnitarioCentavos =
      input.valorUnitarioCentavos ?? input.valorCentavos;

    const telefone = this.normalizarTelefone(input.telefonePagador);
    const body: PagBankOrderRequest = {
      reference_id: input.vendaId,
      customer: {
        name: input.nomePagador,
        email: input.emailPagador || 'cliente.sem.email@capitaldepremios.com.br',
        tax_id: input.cpfPagador.replace(/\D/g, ''),
        ...(telefone ? { phones: [telefone] } : {}),
      },
      items: [
        {
          reference_id: input.vendaId,
          name: input.descricao,
          quantity: quantidadeItens,
          unit_amount: valorUnitarioCentavos,
        },
      ],
      qr_codes: [
        {
          amount: { value: input.valorCentavos },
          expiration_date: expiracao,
        },
      ],
      notification_urls: [this.resolverWebhookUrl()],
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

    const qrCode = response.qr_codes?.[0];

    if (!response.id) {
      throw new Error('PagBank não retornou id do pedido PIX');
    }

    if (!qrCode) {
      throw new Error('PagBank não retornou QR Code na criação do pedido PIX');
    }

    this.logger.log(
      `Pedido PIX criado: orderId=${response.id} qrCodeId=${qrCode.id}`,
    );

    // Link da imagem do QR Code
    const qrImageLink = qrCode?.links?.find(
      (l) => l.rel === 'QRCODE.PNG' || l.media?.includes('image'),
    )?.href;

    const qrBase64Link = qrCode.links?.find(
      (l) => l.rel === 'QRCODE.BASE64' || l.media?.includes('text/plain'),
    )?.href;

    return {
      gatewayId: response.id,
      pixCopiaECola: qrCode.text,
      qrCodeBase64: qrBase64Link ?? qrImageLink,
      urlPagamento: qrImageLink,
      payload: {
        pagbankRequest: body,
        pagbankResponse: response,
        orderId: response.id,
        qrCodeId: qrCode.id,
        qrCodeText: qrCode.text,
        qrCodePngUrl: qrImageLink,
        qrCodeBase64Url: qrBase64Link,
      },
    };
  }

  async consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput> {
    const token = await this.obterToken();

    if (gatewayId.startsWith('ORDE_')) {
      const response = await this.request<PagBankOrderResponse>(
        'GET',
        `/orders/${gatewayId}`,
        token,
      );
      const charge = response.charges?.[0];
      const status = charge
        ? (STATUS_MAP[charge.status] ?? 'PENDENTE')
        : 'PENDENTE';
      const paidAt =
        status === 'APROVADO' && charge?.paid_at
          ? new Date(charge.paid_at)
          : undefined;

      return {
        status,
        paidAt,
        payload: response as unknown as Record<string, unknown>,
      };
    }

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
    if (gatewayId.startsWith('ORDE_')) {
      this.logger.warn(
        `Cancelamento direto de pedido PIX PagBank não executado: orderId=${gatewayId}`,
      );
      return;
    }

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
    const authHeader =
      this.directToken === token
        ? this.formatarBearerToken(token)
        : `Bearer ${token}`;
    return this.requestRaw<T>(method, path, authHeader, body);
  }

  private formatarBearerToken(token: string): string {
    return token.trim().toLowerCase().startsWith('bearer ')
      ? token.trim()
      : `Bearer ${token.trim()}`;
  }

  private resolverWebhookUrl(): string {
    const webhookUrl = this.config.get<string>('PAGBANK_NOTIFICATION_URL');
    if (webhookUrl?.trim()) {
      return webhookUrl.trim();
    }

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    return `${appUrl.replace(/\/+$/, '')}/api/pagamentos/webhook/pix`;
  }

  private normalizarTelefone(telefone?: string): PagBankCustomerPhone | null {
    if (!telefone) {
      return null;
    }

    const digits = telefone.replace(/\D/g, '');
    const semPais =
      digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;

    if (semPais.length < 10) {
      return null;
    }

    return {
      country: '55',
      area: semPais.slice(0, 2),
      number: semPais.slice(2),
      type: 'MOBILE',
    };
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
      throw new Error(`API PagBank retornou ${response.status}: ${errorBody}`);
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
