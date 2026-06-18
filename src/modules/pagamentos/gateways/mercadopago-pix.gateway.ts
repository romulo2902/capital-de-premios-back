import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import type {
  PaymentGateway,
  CriarCobrancaInput,
  CriarCobrancaOutput,
  ConsultarCobrancaOutput,
  StatusCobrancaGateway,
} from './payment-gateway.interface';

/**
 * Mapeia status de pagamento da API Pagamentos clássica do Mercado Pago
 * para status interno normalizado.
 *
 * Referência: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-payment/post
 */
type PaymentResponse = Awaited<ReturnType<Payment['get']>>;

const STATUS_MAP: Record<string, StatusCobrancaGateway> = {
  pending: 'PENDENTE',
  in_process: 'PENDENTE',
  authorized: 'PENDENTE',
  in_mediation: 'PENDENTE',
  approved: 'APROVADO',
  rejected: 'CANCELADO',
  cancelled: 'CANCELADO',
  refunded: 'CANCELADO',
  charged_back: 'CANCELADO',
};

@Injectable()
export class MercadoPagoPixGateway implements PaymentGateway {
  private readonly logger = new Logger(MercadoPagoPixGateway.name);

  private readonly payment: Payment;
  private readonly accessToken: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN', '');
    const mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: this.accessToken,
    });
    this.payment = new Payment(mercadoPagoConfig);
  }

  /**
   * Em contas de teste, a API Pagamentos rejeita qualquer e-mail que não
   * termine em "@testuser.com". Quando configurado,
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
    if (!this.accessToken) {
      throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    }

    const expiracaoSegundos = input.expiracaoSegundos ?? 1800;
    const valorTotal = input.valorCentavos / 100;
    const dataExpiracao = new Date(
      Date.now() + expiracaoSegundos * 1000,
    ).toISOString();
    const emailPagador = this.resolverEmailPagador(input.emailPagador);

    this.logger.log(
      `Criando pagamento PIX Mercado Pago: vendaId=${input.vendaId} valor=${input.valorCentavos}¢ payerEmail=${emailPagador}`,
    );

    const response = await this.payment.create({
      body: {
        transaction_amount: valorTotal,
        description: input.descricao,
        payment_method_id: 'pix',
        external_reference: input.vendaId,
        date_of_expiration: dataExpiracao,
        payer: {
          email: emailPagador,
          identification: {
            type: 'CPF',
            number: input.cpfPagador.replace(/\D/g, ''),
          },
        },
      },
    });

    const transacao = response.point_of_interaction?.transaction_data;

    if (!response.id) {
      throw new Error('Mercado Pago não retornou id do pagamento PIX');
    }

    if (!transacao?.qr_code) {
      throw new Error(
        'Mercado Pago não retornou QR Code na criação do pagamento PIX',
      );
    }

    this.logger.log(
      `Pagamento PIX criado: paymentId=${response.id} status=${response.status}`,
    );

    return {
      gatewayId: String(response.id),
      pixCopiaECola: transacao.qr_code,
      qrCodeBase64: transacao.qr_code_base64,
      urlPagamento: transacao.ticket_url,
      payload: {
        mercadoPagoResponse: response,
        paymentId: response.id,
      },
    };
  }

  async consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput> {
    const response = await this.payment.get({ id: gatewayId });

    const status = STATUS_MAP[response.status ?? ''] ?? 'PENDENTE';
    const statusFinal = this.detectarExpiracao(response, status);
    const paidAt =
      statusFinal === 'APROVADO' && response.date_approved
        ? new Date(response.date_approved)
        : undefined;

    return {
      status: statusFinal,
      paidAt,
      payload: response as unknown as Record<string, unknown>,
    };
  }

  async cancelarCobranca(gatewayId: string): Promise<void> {
    try {
      await this.payment.cancel({ id: gatewayId });
      this.logger.log(`Pagamento PIX Mercado Pago cancelado: paymentId=${gatewayId}`);
    } catch (error) {
      this.logger.warn(
        `Falha ao cancelar pagamento Mercado Pago ${gatewayId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ─── Helpers ───────────────────────────────────────────

  /**
   * Um Pix expirado (não pago até `date_of_expiration`) é reportado pela API
   * como status `cancelled` com `status_detail` indicando a expiração — sem
   * isso, o front trataria expiração e cancelamento manual da mesma forma.
   */
  private detectarExpiracao(
    response: PaymentResponse,
    status: StatusCobrancaGateway,
  ): StatusCobrancaGateway {
    if (status === 'CANCELADO' && response.status_detail?.includes('expired')) {
      return 'EXPIRADO';
    }

    return status;
  }
}
