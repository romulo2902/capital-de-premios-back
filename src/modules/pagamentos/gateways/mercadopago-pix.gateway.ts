import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type {
  PaymentGateway,
  CriarCobrancaInput,
  CriarCobrancaOutput,
  ConsultarCobrancaOutput,
  StatusCobrancaGateway,
} from './payment-gateway.interface';

/**
 * Mapeia status de Order da Orders API do Mercado Pago para status interno normalizado.
 *
 * Referência: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status
 */
const STATUS_MAP: Record<string, StatusCobrancaGateway> = {
  created: 'PENDENTE',
  processing: 'PENDENTE',
  action_required: 'PENDENTE',
  processed: 'APROVADO',
  expired: 'EXPIRADO',
  canceled: 'CANCELADO',
  failed: 'CANCELADO',
  charged_back: 'CANCELADO',
  refunded: 'CANCELADO',
};

interface MercadoPagoPayment {
  id: string;
  status: string;
  status_detail?: string;
  amount: string;
  date_approved?: string;
  payment_method: {
    id: string;
    type: string;
    ticket_url?: string;
    qr_code?: string;
    qr_code_base64?: string;
  };
  [key: string]: unknown;
}

interface MercadoPagoOrderResponse {
  id: string;
  type: string;
  status: string;
  status_detail?: string;
  total_amount: string;
  external_reference?: string;
  transactions?: {
    payments?: MercadoPagoPayment[];
  };
  [key: string]: unknown;
}

type MercadoPagoOrderRequest = {
  type: 'online';
  total_amount: string;
  external_reference: string;
  processing_mode: 'automatic';
  transactions: {
    payments: Array<{
      amount: string;
      payment_method: { id: 'pix'; type: 'bank_transfer' };
      expiration_time?: string;
    }>;
  };
  payer: {
    email: string;
    identification: { type: 'CPF'; number: string };
  };
};

@Injectable()
export class MercadoPagoPixGateway implements PaymentGateway {
  private readonly logger = new Logger(MercadoPagoPixGateway.name);

  private readonly apiUrl: string;
  private readonly accessToken: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>(
      'MERCADOPAGO_API_URL',
      'https://api.mercadopago.com',
    );
    this.accessToken = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN', '');
  }

  /**
   * Em contas de teste, a Orders API rejeita qualquer e-mail que não termine
   * em "@testuser.com" (erro `invalid_email_for_sandbox`). Quando configurado,
   * `MERCADOPAGO_SANDBOX_PAYER_EMAIL` substitui o e-mail real do cliente pelo
   * e-mail do usuário de teste comprador. Deve ficar VAZIO em produção.
   */
  private resolverEmailPagador(emailPagador?: string): string {
    const emailSandbox = this.config
      .get<string>('MERCADOPAGO_SANDBOX_PAYER_EMAIL', '')
      .trim();

    if (emailSandbox) {
      return emailSandbox;
    }

    return emailPagador || 'cliente.sem.email@capitaldepremios.com.br';
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    const expiracaoSegundos = input.expiracaoSegundos ?? 1800;
    const valorTotal = this.centavosParaDecimal(input.valorCentavos);

    const body: MercadoPagoOrderRequest = {
      type: 'online',
      total_amount: valorTotal,
      external_reference: input.vendaId,
      processing_mode: 'automatic',
      transactions: {
        payments: [
          {
            amount: valorTotal,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: this.segundosParaIso8601Duration(expiracaoSegundos),
          },
        ],
      },
      payer: {
        email: this.resolverEmailPagador(input.emailPagador),
        identification: {
          type: 'CPF',
          number: input.cpfPagador.replace(/\D/g, ''),
        },
      },
    };

    this.logger.log(
      `Criando cobrança PIX Mercado Pago: vendaId=${input.vendaId} valor=${input.valorCentavos}¢`,
    );

    const response = await this.request<MercadoPagoOrderResponse>(
      'POST',
      '/v1/orders',
      body,
      { 'X-Idempotency-Key': randomUUID() },
    );

    const pagamento = response.transactions?.payments?.[0];

    if (!response.id) {
      throw new Error('Mercado Pago não retornou id do pedido PIX');
    }

    if (!pagamento?.payment_method?.qr_code) {
      throw new Error(
        'Mercado Pago não retornou QR Code na criação do pedido PIX',
      );
    }

    this.logger.log(
      `Pedido PIX criado: orderId=${response.id} paymentId=${pagamento.id}`,
    );

    return {
      gatewayId: response.id,
      pixCopiaECola: pagamento.payment_method.qr_code,
      qrCodeBase64: pagamento.payment_method.qr_code_base64,
      urlPagamento: pagamento.payment_method.ticket_url,
      payload: {
        mercadoPagoRequest: body,
        mercadoPagoResponse: response,
        orderId: response.id,
        paymentId: pagamento.id,
      },
    };
  }

  async consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput> {
    const response = await this.request<MercadoPagoOrderResponse>(
      'GET',
      `/v1/orders/${gatewayId}`,
    );

    const status = STATUS_MAP[response.status] ?? 'PENDENTE';
    const pagamento = response.transactions?.payments?.[0];
    const paidAt =
      status === 'APROVADO' && pagamento?.date_approved
        ? new Date(pagamento.date_approved)
        : undefined;

    return {
      status,
      paidAt,
      payload: response as unknown as Record<string, unknown>,
    };
  }

  async cancelarCobranca(gatewayId: string): Promise<void> {
    try {
      await this.request('POST', `/v1/orders/${gatewayId}/cancel`);
      this.logger.log(
        `Cobrança PIX Mercado Pago cancelada: orderId=${gatewayId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao cancelar order Mercado Pago ${gatewayId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ─── Helpers ───────────────────────────────────────────

  private centavosParaDecimal(centavos: number): string {
    return (centavos / 100).toFixed(2);
  }

  /** A Orders API exige expiração entre 30 minutos e 30 dias. */
  private segundosParaIso8601Duration(segundos: number): string {
    const totalMinutos = Math.max(30, Math.ceil(segundos / 60));
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;
    return horas > 0 ? `PT${horas}H${minutos}M` : `PT${minutos}M`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    if (!this.accessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    }

    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
      ...extraHeaders,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Erro na API Mercado Pago: ${method} ${path} → ${response.status}: ${errorBody}`,
      );
      throw new Error(
        `API Mercado Pago retornou ${response.status}: ${errorBody}`,
      );
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
