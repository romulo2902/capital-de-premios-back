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
 * Mapeia status de transação PIX do AgilizePay para status interno normalizado.
 *
 * Referência: https://docs.agilizepay.com/pix-in/get-transaction
 */
const STATUS_MAP: Record<string, StatusCobrancaGateway> = {
  pendente: 'PENDENTE',
  ativo: 'PENDENTE',
  active: 'PENDENTE',
  aprovado: 'APROVADO',
  sucesso: 'APROVADO',
  expirado: 'EXPIRADO',
  cancelado: 'CANCELADO',
};

interface AgilizePayTokenResponse {
  success: boolean;
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface AgilizePayCreateTransactionResponse {
  location?: string;
  correlationId?: string;
  txid: string;
  status: string;
  chave?: string;
  pixCopiaECola: string;
  qrCode: string;
  url_checkout?: string;
  [key: string]: unknown;
}

interface AgilizePayGetTransactionResponse {
  txid: string;
  status: string;
  pixCopiaECola?: string;
  qrCode?: string;
  endToEnd?: string;
  paid_by?: string;
  paid_by_tax_id?: string;
  paid_amount?: number;
  tax_amount?: number;
  url_checkout?: string;
  [key: string]: unknown;
}

@Injectable()
export class AgilizePayPixGateway implements PaymentGateway {
  private readonly logger = new Logger(AgilizePayPixGateway.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly certClient: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>(
      'AGILIZEPAY_API_URL',
      'https://api.agilizepay.com',
    );
    this.clientId = this.config.get<string>('AGILIZEPAY_CLIENT_ID', '');
    this.certClient = this.config.get<string>('AGILIZEPAY_CERT_CLIENT', '');
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    const token = await this.obterToken();

    const body = {
      code: input.vendaId,
      amount: Number((input.valorCentavos / 100).toFixed(2)),
      name: input.nomePagador || null,
      document: input.cpfPagador ? input.cpfPagador.replace(/\D/g, '') : null,
      url: this.resolverWebhookUrl(),
    };

    this.logger.log(
      `Criando cobrança PIX AgilizePay: vendaId=${input.vendaId} valor=${input.valorCentavos}¢`,
    );

    const response = await this.request<AgilizePayCreateTransactionResponse>(
      'POST',
      '/pix',
      token,
      body,
    );

    if (!response.txid) {
      throw new Error('AgilizePay não retornou txid da transação PIX');
    }

    if (!response.pixCopiaECola) {
      throw new Error(
        'AgilizePay não retornou código copia-e-cola na criação do PIX',
      );
    }

    this.logger.log(`Transação PIX AgilizePay criada: txid=${response.txid}`);

    return {
      gatewayId: response.txid,
      pixCopiaECola: response.pixCopiaECola,
      qrCodeBase64: response.qrCode,
      urlPagamento: response.url_checkout,
      payload: {
        agilizepayRequest: body,
        agilizepayResponse: response,
        txid: response.txid,
      },
    };
  }

  async consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput> {
    const token = await this.obterToken();

    const response = await this.request<AgilizePayGetTransactionResponse>(
      'GET',
      `/pix/${gatewayId}`,
      token,
    );

    const status = STATUS_MAP[response.status?.toLowerCase() ?? ''] ?? 'PENDENTE';

    return {
      status,
      // AgilizePay não documenta um campo de data/hora do pagamento na
      // consulta — sem isso confiável, não fabricamos um paidAt aqui.
      payload: response as unknown as Record<string, unknown>,
    };
  }

  /**
   * A documentação do AgilizePay não lista um endpoint de cancelamento para
   * PIX de entrada (apenas create/get/history) — o PIX expira sozinho pelo
   * prazo definido na criação. Segue o mesmo padrão tolerante já usado para
   * o caso ORDE_ do PagBank.
   */
  async cancelarCobranca(gatewayId: string): Promise<void> {
    this.logger.warn(
      `Cancelamento de cobrança PIX AgilizePay não suportado pela API — ignorado: txid=${gatewayId}`,
    );
  }

  // ─── Helpers ───────────────────────────────────────────

  private async obterToken(): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.tokenExpiresAt > now) {
      return this.cachedToken;
    }

    const url = `${this.apiUrl}/auth/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        client_id: this.clientId,
        cert_client: this.certClient,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Erro ao autenticar na API AgilizePay: ${response.status}: ${errorBody}`,
      );
      throw new Error(`API AgilizePay retornou ${response.status} ao autenticar`);
    }

    const data = (await response.json()) as AgilizePayTokenResponse;

    this.cachedToken = data.access_token;
    // Margem de segurança de 60 segundos
    this.tokenExpiresAt = now + (data.expires_in - 60) * 1000;

    this.logger.log('Token de acesso AgilizePay obtido com sucesso');
    return this.cachedToken;
  }

  private resolverWebhookUrl(): string {
    const webhookUrl = this.config.get<string>('AGILIZEPAY_NOTIFICATION_URL');
    if (webhookUrl?.trim()) {
      return webhookUrl.trim();
    }

    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    return `${appUrl.replace(/\/+$/, '')}/api/pagamentos/webhook/agilizepay`;
  }

  private async request<T>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        client_id: this.clientId,
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Erro na API AgilizePay: ${method} ${path} → ${response.status}: ${errorBody}`,
      );
      throw new Error(`API AgilizePay retornou ${response.status}: ${errorBody}`);
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
