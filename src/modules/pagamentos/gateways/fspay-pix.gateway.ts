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
 * Mapeia status de transação PIX do FSPay para status interno normalizado.
 *
 * Referência: https://docs.fspay.com.br (Cash In PIX — Consultar / Webhook).
 * `CREATED` não está documentado, mas é o status observado logo após criar
 * a cobrança (antes de virar `PENDING`) — validado via smoke test real.
 */
const STATUS_MAP: Record<string, StatusCobrancaGateway> = {
  CREATED: 'PENDENTE',
  PENDING: 'PENDENTE',
  PAID: 'APROVADO',
  EXPIRED: 'EXPIRADO',
  CANCELED: 'CANCELADO',
  CANCELLED: 'CANCELADO',
};

interface FsPayEnvelope<T> {
  success: boolean;
  timestamp: string;
  payload?: T;
  message?: string | string[];
  error?: string;
}

interface FsPayTokenPayload {
  token: string;
}

interface FsPayCreateTransactionPayload {
  id: string;
  txId: string;
  idempotency_id: string;
  value: number;
  status: string;
  copy_paste: string;
  qr_code: string;
  expiration_date?: string;
  [key: string]: unknown;
}

interface FsPayGetTransactionPayload {
  id: string;
  txId: string;
  idempotency_id: string;
  status: string;
  value: number;
  paid_at?: string | null;
  paid_value?: number;
  [key: string]: unknown;
}

@Injectable()
export class FsPayPixGateway implements PaymentGateway {
  private readonly logger = new Logger(FsPayPixGateway.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly apiUrl: string;
  private readonly accessKey: string;
  private readonly accessSecret: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>(
      'FSPAY_API_URL',
      'https://api.fspay.com.br',
    );
    this.accessKey = this.config.get<string>('FSPAY_ACCESS_KEY', '');
    this.accessSecret = this.config.get<string>('FSPAY_ACCESS_SECRET', '');
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    const token = await this.obterToken();

    const expiracaoSegundos = Math.min(
      input.expiracaoSegundos ?? 1800,
      15 * 24 * 60 * 60, // limite documentado: 15 dias
    );

    const body = {
      value: Number((input.valorCentavos / 100).toFixed(2)),
      idempotency_id: input.vendaId,
      document: input.cpfPagador.replace(/\D/g, ''),
      description: input.descricao,
      email: input.emailPagador || 'cliente.sem.email@capitaldepremios.com.br',
      name: input.nomePagador,
      expiration_date: this.formatarExpirationDate(expiracaoSegundos),
    };

    this.logger.log(
      `Criando cobrança PIX FSPay: vendaId=${input.vendaId} valor=${input.valorCentavos}¢`,
    );

    const envelope = await this.request<FsPayCreateTransactionPayload>(
      'POST',
      '/cash-in/v1/pix/create',
      token,
      body,
    );

    const payload = this.exigirPayload(envelope, 'criar cobrança PIX');

    if (!payload.copy_paste) {
      throw new Error(
        'FSPay não retornou código copia-e-cola na criação do PIX',
      );
    }

    this.logger.log(
      `Transação PIX FSPay criada: id=${payload.id} txId=${payload.txId}`,
    );

    return {
      gatewayId: payload.idempotency_id,
      pixCopiaECola: payload.copy_paste,
      qrCodeBase64: payload.qr_code,
      payload: {
        fspayRequest: body,
        fspayResponse: envelope,
        id: payload.id,
        txId: payload.txId,
      },
    };
  }

  /**
   * Consulta por `idempotency_id`, que no FSPay coincide sempre com o nosso
   * `vendaId` (é o valor que enviamos ao criar a cobrança) — evita depender
   * do `id`/`txId` opacos gerados pelo FSPay para localizar a transação.
   *
   * Atenção: a documentação do FSPay avisa que esta consulta só é válida
   * para transações de até 1h atrás; depois disso só pelo Dashboard deles.
   */
  async consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput> {
    const token = await this.obterToken();

    const envelope = await this.request<FsPayGetTransactionPayload>(
      'GET',
      `/report/v1/api/cash-in?idempotency_id=${encodeURIComponent(gatewayId)}`,
      token,
    );

    const payload = this.exigirPayload(envelope, 'consultar cobrança PIX');
    const status = STATUS_MAP[payload.status] ?? 'PENDENTE';
    const paidAt =
      status === 'APROVADO' && payload.paid_at
        ? new Date(payload.paid_at)
        : undefined;

    return {
      status,
      paidAt,
      payload: payload as unknown as Record<string, unknown>,
    };
  }

  /**
   * A documentação do FSPay não lista endpoint de cancelamento para Cash In
   * (só existe fluxo de saque/Cash Out, que é outra coisa) — o PIX expira
   * sozinho pelo prazo definido em `expiration_date`. Mesmo padrão tolerante
   * já usado para o AgilizePay e para o caso ORDE_ do PagBank.
   */
  async cancelarCobranca(gatewayId: string): Promise<void> {
    this.logger.warn(
      `Cancelamento de cobrança PIX FSPay não suportado pela API — ignorado: idempotency_id=${gatewayId}`,
    );
  }

  // ─── Helpers ───────────────────────────────────────────

  private async obterToken(): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.tokenExpiresAt > now) {
      return this.cachedToken;
    }

    const credentials = Buffer.from(
      `${this.accessKey}:${this.accessSecret}`,
    ).toString('base64');

    const response = await fetch(`${this.apiUrl}/api-auth/v1/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });

    const envelope = (await response.json()) as FsPayEnvelope<FsPayTokenPayload>;

    if (!response.ok || !envelope.success || !envelope.payload?.token) {
      const erro = this.formatarErro(envelope);
      this.logger.error(`Erro ao autenticar na API FSPay: ${erro}`);
      throw new Error(`API FSPay retornou erro ao autenticar: ${erro}`);
    }

    this.cachedToken = envelope.payload.token;
    // FSPay não informa expires_in — decodifica o `exp` do próprio JWT.
    this.tokenExpiresAt =
      this.decodificarExpiracaoJwt(this.cachedToken) ?? now + 50 * 60 * 1000;

    this.logger.log('Token de acesso FSPay obtido com sucesso');
    return this.cachedToken;
  }

  private decodificarExpiracaoJwt(token: string): number | undefined {
    try {
      const payloadBase64 = token.split('.')[1];
      // JWT usa base64url (não o base64 padrão) — Buffer.from com 'base64'
      // ignora silenciosamente os caracteres "-"/"_" e corrompe o payload.
      const json = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
      const decoded = JSON.parse(json) as { exp?: number };

      // Margem de segurança de 60 segundos
      return typeof decoded.exp === 'number'
        ? decoded.exp * 1000 - 60_000
        : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * FSPay pede a data de expiração sem timezone (`YYYY-MM-DDTHH:MM:SS`) — a
   * doc não esclarece o fuso esperado pelo backend deles, então assumimos
   * UTC de forma explícita (mais previsível que confiar no fuso do processo
   * Node local).
   */
  private formatarExpirationDate(expiracaoSegundos: number): string {
    const data = new Date(Date.now() + expiracaoSegundos * 1000);
    return data.toISOString().slice(0, 19);
  }

  private exigirPayload<T>(envelope: FsPayEnvelope<T>, acao: string): T {
    if (!envelope.success || !envelope.payload) {
      throw new Error(
        `FSPay retornou erro ao ${acao}: ${this.formatarErro(envelope)}`,
      );
    }

    return envelope.payload;
  }

  private formatarErro(envelope: FsPayEnvelope<unknown>): string {
    if (Array.isArray(envelope.message)) {
      return envelope.message.join('; ');
    }

    return envelope.message ?? envelope.error ?? 'erro desconhecido';
  }

  private async request<T>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<FsPayEnvelope<T>> {
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const envelope = (text ? JSON.parse(text) : {}) as FsPayEnvelope<T>;

    if (!response.ok) {
      this.logger.error(
        `Erro na API FSPay: ${method} ${path} → ${response.status}: ${text}`,
      );
    }

    return envelope;
  }
}
