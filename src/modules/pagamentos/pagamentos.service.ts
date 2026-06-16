import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Prisma, StatusVenda, StatusVendaSena } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { MercadoPagoPixGateway } from './gateways/mercadopago-pix.gateway';
import { VendasService } from '../vendas/vendas.service';
import { VendasSenaService } from '../capital-sena/vendas-sena/vendas-sena.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { EmailService } from '../../common/email/email.service';

type EventoPagamentoPagBank = {
  identificador: string;
  status: string | undefined;
  referenceId?: string;
  chargeId?: string;
  orderId?: string;
  qrCodeId?: string;
  payload: Record<string, unknown>;
};

type PagBankNotificationLookupResult = {
  body: Record<string, unknown>;
  format: 'json' | 'xml';
};

type ConfirmacaoN8nPayload = {
  pedidoId: string;
  transacaoId: string | null;
  nome: string;
  telefone: string | null;
  cpf: string;
  valor: string;
  dataHora: string;
  status: 'APROVADO';
};

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
    private readonly mercadoPagoPixGateway: MercadoPagoPixGateway,
    private readonly vendasService: VendasService,
    @Inject(forwardRef(() => VendasSenaService))
    private readonly vendasSenaService: VendasSenaService,
    private readonly distributedLock: DistributedLockService,
    private readonly emailService: EmailService,
  ) {}

  // ─── WEBHOOK PIX (PagBank) ────────────────────────────

  async processarWebhookPix(body: Record<string, unknown>) {
    this.logger.log(`Webhook PIX PagBank recebido: ${JSON.stringify(body)}`);
    return this.processarWebhookPagBank(body);
  }

  // ─── WEBHOOK CARTÃO (PagBank) ─────────────────────────

  async processarWebhookCartao(body: Record<string, unknown>) {
    this.logger.log(`Webhook Cartão PagBank recebido: ${JSON.stringify(body)}`);
    return this.processarWebhookPagBank(body);
  }

  // ─── WEBHOOK PIX (Mercado Pago) ────────────────────────
  //
  // A notificação da Orders API só garante o id do order (`data.id`);
  // o status real é sempre buscado via GET /v1/orders/{id} — nunca
  // confiamos em um eventual status embutido no corpo do webhook.

  async processarWebhookMercadoPago(
    headers: Record<string, string | string[] | undefined>,
    query: Record<string, unknown>,
    body: Record<string, unknown>,
  ) {
    this.logger.log(`Webhook Mercado Pago recebido: ${JSON.stringify(body)}`);

    const orderId = this.extrairOrderIdMercadoPago(body, query);
    if (!orderId) {
      this.logger.warn('Webhook Mercado Pago sem data.id de order — ignorado');
      return { message: 'Webhook recebido (sem dados de pagamento)' };
    }

    if (!this.validarAssinaturaMercadoPago(headers, orderId)) {
      this.logger.warn(
        `Assinatura inválida no webhook Mercado Pago para order ${orderId}`,
      );
      throw new BadRequestException('Assinatura do webhook inválida');
    }

    const lockKey = `lock:mercadopago:webhook:${orderId}`;
    const lock = await this.distributedLock.acquire(lockKey, 30_000);
    if (!lock) {
      this.logger.warn(
        `Webhook Mercado Pago ignorado temporariamente para order ${orderId} (já em processamento em outra instância)`,
      );
      return {
        message: 'Webhook em processamento',
        data: { gatewayId: orderId, status: 'EM_PROCESSAMENTO' },
      };
    }

    try {
      const resultado = await this.mercadoPagoPixGateway.consultarCobranca(
        orderId,
      );

      if (resultado.status !== 'APROVADO') {
        this.logger.log(
          `Order Mercado Pago ${orderId} ainda não aprovada (status=${resultado.status})`,
        );
        return {
          message: 'Webhook processado',
          data: {
            gatewayId: orderId,
            status: `IGNORADO_${resultado.status}`,
          },
        };
      }

      const venda = await this.prisma.venda.findFirst({
        where: { gatewayId: orderId },
        select: { id: true, status: true },
      });

      if (venda) {
        if (venda.status !== StatusVenda.PENDENTE) {
          this.logger.log(
            `Venda ${venda.id} já processada (status: ${venda.status})`,
          );
          return {
            message: 'Webhook processado',
            data: { gatewayId: orderId, status: 'JA_PROCESSADA' },
          };
        }

        await this.vendasService.confirmarPagamento(venda.id, {
          mercadoPagoWebhook: body,
          mercadoPagoOrder: resultado.payload,
          confirmadoEm: new Date().toISOString(),
        });
        await this.notificarConfirmacaoPagamentoN8n(venda.id, orderId);
        void this.enviarEmailCompraAprovada(venda.id);
        this.logger.log(
          `Pagamento confirmado via webhook Mercado Pago para venda ${venda.id}`,
        );
        return {
          message: 'Webhook processado',
          data: { gatewayId: orderId, status: 'CONFIRMADA' },
        };
      }

      const vendaSena = await this.prisma.vendaSena.findFirst({
        where: { gatewayId: orderId },
        select: { id: true, status: true },
      });

      if (!vendaSena) {
        this.logger.warn(
          `Venda não encontrada para order Mercado Pago ${orderId}`,
        );
        return {
          message: 'Webhook processado',
          data: { gatewayId: orderId, status: 'VENDA_NAO_ENCONTRADA' },
        };
      }

      if (vendaSena.status !== StatusVendaSena.PENDENTE) {
        this.logger.log(
          `Venda Sena ${vendaSena.id} já processada (status: ${vendaSena.status})`,
        );
        return {
          message: 'Webhook processado',
          data: { gatewayId: orderId, status: 'JA_PROCESSADA' },
        };
      }

      await this.vendasSenaService.confirmarPagamento(vendaSena.id, {
        mercadoPagoWebhook: body,
        mercadoPagoOrder: resultado.payload,
        confirmadoEm: new Date().toISOString(),
      });
      void this.enviarEmailCompraAprovadaSena(vendaSena.id);
      this.logger.log(
        `Pagamento confirmado via webhook Mercado Pago para venda Sena ${vendaSena.id}`,
      );
      return {
        message: 'Webhook processado',
        data: { gatewayId: orderId, status: 'CONFIRMADA_SENA' },
      };
    } catch (error) {
      this.logger.error(
        `Erro ao confirmar pagamento Mercado Pago para order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        message: 'Webhook processado',
        data: { gatewayId: orderId, status: 'ERRO' },
      };
    } finally {
      await this.distributedLock.release(lock);
    }
  }

  private extrairOrderIdMercadoPago(
    body: Record<string, unknown>,
    query: Record<string, unknown>,
  ): string | undefined {
    const data = this.objeto(body['data']);
    const idDoBody = data ? this.lerString(data, 'id') : undefined;
    const idDaQuery =
      typeof query['data.id'] === 'string'
        ? (query['data.id'] as string)
        : undefined;

    return idDoBody ?? idDaQuery;
  }

  /**
   * Valida o header `x-signature` enviado pelo Mercado Pago.
   *
   * Referência: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications
   * manifest = "id:{data.id};request-id:{x-request-id};ts:{ts};" assinado
   * com HMAC-SHA256 usando o webhook secret configurado no painel.
   *
   * Se `MERCADOPAGO_WEBHOOK_SECRET` não estiver configurado (ex.: ainda não
   * gerado no painel em sandbox), apenas avisa e segue sem validar —
   * mesmo padrão tolerante já usado para o PagBank neste serviço.
   */
  private validarAssinaturaMercadoPago(
    headers: Record<string, string | string[] | undefined>,
    orderId: string,
  ): boolean {
    const secret = this.config
      .get<string>('MERCADOPAGO_WEBHOOK_SECRET', '')
      .trim();

    if (!secret) {
      this.logger.warn(
        'MERCADOPAGO_WEBHOOK_SECRET não configurado — assinatura do webhook Mercado Pago não está sendo validada.',
      );
      return true;
    }

    const xSignature = this.lerHeader(headers, 'x-signature');
    const xRequestId = this.lerHeader(headers, 'x-request-id');

    if (!xSignature || !xRequestId) {
      this.logger.warn(
        `Assinatura Mercado Pago ausente: x-signature=${xSignature ?? 'N/A'} x-request-id=${xRequestId ?? 'N/A'}`,
      );
      return false;
    }

    const partes = Object.fromEntries(
      xSignature.split(',').map((parte) => {
        const [chave, valor] = parte.split('=');
        return [chave?.trim(), valor?.trim()];
      }),
    );

    const ts = partes['ts'];
    const v1 = partes['v1'];

    if (!ts || !v1) {
      this.logger.warn(
        `x-signature em formato inesperado: "${xSignature}" (ts=${ts ?? 'N/A'} v1=${v1 ?? 'N/A'})`,
      );
      return false;
    }

    // DEBUG TEMPORÁRIO: testando duas variantes do manifest (id minúsculo vs
    // id como veio na notificação) até confirmar qual a Mercado Pago usa de
    // fato para assinar — remover a variante errada após validar em produção.
    const calcularHash = (idParaManifest: string): string => {
      const manifest = `id:${idParaManifest};request-id:${xRequestId};ts:${ts};`;
      return createHmac('sha256', secret).update(manifest).digest('hex');
    };

    const hashMinusculo = calcularHash(orderId.toLowerCase());
    const hashOriginal = calcularHash(orderId);

    if (hashMinusculo !== v1 && hashOriginal !== v1) {
      this.logger.warn(
        `Hash não confere (nenhuma variante bateu) — orderId=${orderId} requestId=${xRequestId} ts=${ts} hashMinusculo=${hashMinusculo} hashOriginal=${hashOriginal} recebido=${v1} secretLength=${secret.length}`,
      );
      return false;
    }

    if (hashOriginal === v1 && hashMinusculo !== v1) {
      this.logger.log(
        `Assinatura Mercado Pago validada com id em case ORIGINAL (não minúsculo) — ajustar implementação.`,
      );
    }

    return true;
  }

  private lerHeader(
    headers: Record<string, string | string[] | undefined>,
    nome: string,
  ): string | undefined {
    const valor = headers[nome] ?? headers[nome.toLowerCase()];
    return Array.isArray(valor) ? valor[0] : valor;
  }

  // ─── PROCESSAMENTO INTERNO DE WEBHOOK PAGBANK ─────────
  //
  // O PagBank envia eventos em formatos diferentes conforme o produto:
  // { "event": "CHARGE.PAID", "charges": [{ "id": "CHAR_...", "status": "PAID", ... }] }
  // ou payloads de Pix/Order com order.id/reference_id/qr_code.
  //
  // Para QR Code PIX via API Order, o gatewayId no banco é o `order.id`.

  private async processarWebhookPagBank(body: Record<string, unknown>) {
    if (!body) {
      this.logger.warn('Webhook PagBank recebido com body vazio ou nulo.');
      return { message: 'Webhook recebido (sem dados)' };
    }

    const bodyResolvido = await this.resolverBodyWebhookPagBank(body);
    const evento = bodyResolvido['event'] as string | undefined;
    const eventosPagamento = this.extrairEventosPagamento(bodyResolvido);

    if (eventosPagamento.length === 0) {
      this.logger.warn(
        `Webhook PagBank sem identificador de pagamento (event=${evento ?? 'N/A'})`,
      );
      return { message: 'Webhook recebido (sem dados de pagamento)' };
    }

    const resultados: Array<{ gatewayId: string; status: string }> = [];

    for (const eventoPagamento of eventosPagamento) {
      const identificador = eventoPagamento.identificador;
      const statusGateway = eventoPagamento.status;

      if (statusGateway !== 'PAID') {
        this.logger.log(
          `Pagamento ${identificador} ignorado (status=${statusGateway ?? 'N/A'})`,
        );
        resultados.push({
          gatewayId: identificador,
          status: `IGNORADO_${statusGateway ?? 'DESCONHECIDO'}`,
        });
        continue;
      }

      const lockKey = `lock:pagbank:webhook:${identificador}`;
      const lock = await this.distributedLock.acquire(lockKey, 30_000);
      if (!lock) {
        this.logger.warn(
          `Webhook PagBank ignorado temporariamente para gatewayId ${identificador} (já em processamento em outra instância)`,
        );
        resultados.push({
          gatewayId: identificador,
          status: 'EM_PROCESSAMENTO',
        });
        continue;
      }

      try {
        const venda = await this.prisma.venda.findFirst({
          where: this.montarFiltroVendaPorGateway(eventoPagamento),
          select: { id: true, status: true },
        });

        if (venda) {
          if (venda.status !== StatusVenda.PENDENTE) {
            this.logger.log(
              `Venda ${venda.id} já processada (status: ${venda.status})`,
            );
            resultados.push({
              gatewayId: identificador,
              status: 'JA_PROCESSADA',
            });
            continue;
          }

          await this.vendasService.confirmarPagamento(venda.id, {
            pagbankWebhook: body,
            pagbankPayment: eventoPagamento.payload,
            confirmadoEm: new Date().toISOString(),
          });
          await this.notificarConfirmacaoPagamentoN8n(venda.id, identificador);
          void this.enviarEmailCompraAprovada(venda.id);
          resultados.push({ gatewayId: identificador, status: 'CONFIRMADA' });
          this.logger.log(
            `Pagamento confirmado via webhook PagBank para venda ${venda.id}`,
          );
          continue;
        }

        const vendaSena = await this.prisma.vendaSena.findFirst({
          where: this.montarFiltroVendaSenaPorGateway(eventoPagamento),
          select: { id: true, status: true },
        });

        if (!vendaSena) {
          this.logger.warn(
            `Venda não encontrada para gatewayId/reference_id: ${identificador}`,
          );
          resultados.push({
            gatewayId: identificador,
            status: 'VENDA_NAO_ENCONTRADA',
          });
          continue;
        }

        if (vendaSena.status !== StatusVendaSena.PENDENTE) {
          this.logger.log(
            `Venda Sena ${vendaSena.id} já processada (status: ${vendaSena.status})`,
          );
          resultados.push({
            gatewayId: identificador,
            status: 'JA_PROCESSADA',
          });
          continue;
        }

        await this.vendasSenaService.confirmarPagamento(vendaSena.id, {
          pagbankWebhook: body,
          pagbankPayment: eventoPagamento.payload,
          confirmadoEm: new Date().toISOString(),
        });
        void this.enviarEmailCompraAprovadaSena(vendaSena.id);
        resultados.push({ gatewayId: identificador, status: 'CONFIRMADA_SENA' });
        this.logger.log(
          `Pagamento confirmado via webhook PagBank para venda Sena ${vendaSena.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Erro ao confirmar pagamento por gatewayId ${identificador}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        resultados.push({ gatewayId: identificador, status: 'ERRO' });
      } finally {
        await this.distributedLock.release(lock);
      }
    }

    return {
      message: 'Webhook processado',
      data: resultados,
    };
  }

  private async resolverBodyWebhookPagBank(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const notificationCode = this.lerString(body, 'notificationCode');
    const notificationType = this.lerString(body, 'notificationType');

    if (!notificationCode || notificationType !== 'transaction') {
      return body;
    }

    const email = this.config
      .get<string>('PAGBANK_NOTIFICATION_EMAIL', '')
      .trim();
    const token = this.config
      .get<string>('PAGBANK_NOTIFICATION_TOKEN', '')
      .trim();

    if (!email || !token) {
      this.logger.warn(
        'Webhook PagBank com notificationCode recebido, mas PAGBANK_NOTIFICATION_EMAIL/TOKEN não estão configurados.',
      );
      return body;
    }

    try {
      const notificacao = await this.consultarNotificacaoTransacaoPagBank(
        notificationCode,
        email,
        token,
      );
      this.logger.log(
        `Webhook PagBank resolvido via notificationCode ${notificationCode} (${notificacao.format})`,
      );
      return notificacao.body;
    } catch (error) {
      this.logger.error(
        `Falha ao consultar notificationCode ${notificationCode}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return body;
    }
  }

  private extrairEventosPagamento(
    body: Record<string, unknown>,
  ): EventoPagamentoPagBank[] {
    const charges = this.arrayDeObjetos(body['charges']);
    if (charges.length > 0) {
      return charges.flatMap((charge) => {
        const identificador = this.lerString(charge, 'id');
        const metadata = this.objeto(charge['metadata']) ?? {};
        const orderId =
          this.lerString(metadata, 'ps_order_id') ??
          this.lerString(charge, 'order_id');

        return identificador
          ? [
              {
                identificador,
                status: this.lerString(charge, 'status'),
                referenceId: this.lerString(charge, 'reference_id'),
                chargeId: identificador,
                orderId,
                payload: charge,
              },
            ]
          : [];
      });
    }

    const pix = this.arrayDeObjetos(body['pix']);
    if (pix.length > 0) {
      return pix.flatMap((pagamentoPix) => {
        const txid = this.lerString(pagamentoPix, 'txid');
        return txid
          ? [
              {
                identificador: txid,
                status: 'PAID',
                referenceId: txid,
                qrCodeId: txid,
                payload: pagamentoPix,
              },
            ]
          : [];
      });
    }

    const order = this.objeto(body['order']) ?? body;
    const orderId =
      this.lerString(order, 'id') ?? this.lerString(body, 'order_id');
    const referenceId =
      this.lerString(order, 'reference_id') ??
      this.lerString(body, 'reference_id');
    const qrCodeId =
      this.lerString(body, 'qr_code_id') ??
      (this.arrayDeObjetos(order['qr_codes'])[0]?.['id'] as string | undefined);
    const status =
      this.lerString(body, 'status') ??
      this.lerString(order, 'status') ??
      (this.lerString(body, 'event')?.includes('PAID') ? 'PAID' : undefined);
    const identificador = orderId ?? referenceId ?? qrCodeId;

    return identificador
      ? [
          {
            identificador,
            status,
            referenceId,
            orderId,
            qrCodeId,
            payload: body,
          },
        ]
      : [];
  }

  private montarFiltroVendaPorGateway(
    eventoPagamento: EventoPagamentoPagBank,
  ): Prisma.VendaWhereInput {
    const identificadores = [
      eventoPagamento.identificador,
      eventoPagamento.orderId,
      eventoPagamento.referenceId,
      eventoPagamento.chargeId,
      eventoPagamento.qrCodeId,
    ].filter((valor): valor is string => Boolean(valor));

    return {
      OR: [
        { gatewayId: { in: identificadores } },
        { id: { in: identificadores } },
        ...identificadores.flatMap((valor) => [
          { gatewayPayload: { path: ['orderId'], equals: valor } },
          { gatewayPayload: { path: ['qrCodeId'], equals: valor } },
          {
            gatewayPayload: { path: ['pagbankResponse', 'id'], equals: valor },
          },
          {
            gatewayPayload: {
              path: ['pagbankResponse', 'reference_id'],
              equals: valor,
            },
          },
        ]),
      ],
    };
  }

  private montarFiltroVendaSenaPorGateway(
    eventoPagamento: EventoPagamentoPagBank,
  ): Prisma.VendaSenaWhereInput {
    const identificadores = [
      eventoPagamento.identificador,
      eventoPagamento.orderId,
      eventoPagamento.referenceId,
      eventoPagamento.chargeId,
      eventoPagamento.qrCodeId,
    ].filter((valor): valor is string => Boolean(valor));

    return {
      OR: [
        { gatewayId: { in: identificadores } },
        { id: { in: identificadores } },
        ...identificadores.flatMap((valor) => [
          { gatewayPayload: { path: ['orderId'], equals: valor } },
          { gatewayPayload: { path: ['qrCodeId'], equals: valor } },
          {
            gatewayPayload: { path: ['pagbankResponse', 'id'], equals: valor },
          },
          {
            gatewayPayload: {
              path: ['pagbankResponse', 'reference_id'],
              equals: valor,
            },
          },
        ]),
      ],
    };
  }

  private arrayDeObjetos(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null && !Array.isArray(item),
        )
      : [];
  }

  private objeto(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private lerString(
    objeto: Record<string, unknown>,
    chave: string,
  ): string | undefined {
    const valor = objeto[chave];
    return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
  }

  private async consultarNotificacaoTransacaoPagBank(
    notificationCode: string,
    email: string,
    token: string,
  ): Promise<PagBankNotificationLookupResult> {
    const url = new URL(
      `https://ws.pagseguro.uol.com.br/v3/transactions/notifications/${notificationCode}`,
    );
    url.searchParams.set('email', email);
    url.searchParams.set('token', token);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(
        `PagBank retornou ${response.status} ao consultar notificationCode`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    const rawBody = await response.text();

    if (contentType.includes('json')) {
      return {
        body: JSON.parse(rawBody) as Record<string, unknown>,
        format: 'json',
      };
    }

    return {
      body: this.converterXmlNotificacaoEmObjeto(rawBody),
      format: 'xml',
    };
  }

  private converterXmlNotificacaoEmObjeto(
    xml: string,
  ): Record<string, unknown> {
    const transactionCode = this.lerTagXml(xml, 'code');
    const reference = this.lerTagXml(xml, 'reference');
    const statusCodigo = this.lerTagXml(xml, 'status');

    return {
      id: transactionCode,
      reference_id: reference,
      status: this.mapearStatusTransacaoLegada(statusCodigo),
      event:
        this.mapearStatusTransacaoLegada(statusCodigo) === 'PAID'
          ? 'CHARGE.PAID'
          : undefined,
      notificationXml: xml,
    };
  }

  private lerTagXml(xml: string, tagName: string): string | undefined {
    const regex = new RegExp(`<${tagName}>([^<]+)</${tagName}>`, 'i');
    const match = xml.match(regex);
    return match?.[1]?.trim();
  }

  private mapearStatusTransacaoLegada(status?: string): string | undefined {
    switch (status) {
      case '3':
      case '4':
        return 'PAID';
      case '1':
      case '2':
        return 'WAITING';
      case '5':
      case '6':
      case '7':
        return 'CANCELED';
      default:
        return undefined;
    }
  }

  private async notificarConfirmacaoPagamentoN8n(
    vendaId: string,
    identificadorWebhook: string,
  ): Promise<void> {
    const webhookUrl = this.config
      .get<string>('WHATSAPP_CONFIRMACAO_PAGAMENTO_URL', '')
      .trim();

    if (!webhookUrl) {
      this.logger.log(
        'WHATSAPP_CONFIRMACAO_PAGAMENTO_URL não configurada; notificação ao n8n ignorada.',
      );
      return;
    }

    const venda = await this.prisma.venda.findUnique({
      where: { id: vendaId },
      select: {
        id: true,
        gatewayId: true,
        total: true,
        createdAt: true,
        cliente: {
          select: {
            nome: true,
            telefone: true,
            cpf: true,
          },
        },
      },
    });

    if (!venda) {
      this.logger.warn(
        `Não foi possível notificar o n8n: venda ${vendaId} não encontrada.`,
      );
      return;
    }

    const payload: ConfirmacaoN8nPayload = {
      pedidoId: venda.id,
      transacaoId: venda.gatewayId ?? identificadorWebhook,
      nome: venda.cliente.nome,
      telefone: venda.cliente.telefone ?? null,
      cpf: venda.cliente.cpf,
      valor: venda.total.toString(),
      dataHora: new Date().toISOString(),
      status: 'APROVADO',
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
          `n8n retornou ${response.status}: ${responseBody || 'sem corpo'}`,
        );
      }

      this.logger.log(
        `Confirmação da venda ${vendaId} enviada ao n8n com sucesso.`,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao notificar o n8n para a venda ${vendaId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ─── CONSULTAR STATUS ─────────────────────────────────

  async consultarStatusCobranca(vendaId: string) {
    const venda = await this.prisma.venda.findUnique({
      where: { id: vendaId },
      select: {
        id: true,
        gatewayId: true,
        gatewayPayload: true,
        tipoPagamento: true,
        status: true,
      },
    });

    if (!venda) {
      throw new NotFoundException('Venda não encontrada');
    }

    if (!venda.gatewayId) {
      throw new BadRequestException(
        'Venda não possui cobrança vinculada a um gateway',
      );
    }

    const gateway = this.paymentGatewayFactory.getGatewayParaConsulta(
      venda.tipoPagamento,
      venda.gatewayPayload,
    );
    const resultado = await gateway.consultarCobranca(venda.gatewayId);

    return {
      message: 'Status da cobrança consultado com sucesso',
      data: {
        vendaId: venda.id,
        statusInterno: venda.status,
        statusGateway: resultado.status,
        paidAt: resultado.paidAt,
        payload: resultado.payload,
      },
    };
  }

  // ─── LISTAGEM DE PAGAMENTOS (ADMIN) ───────────────────

  async findAll(page = 1, limit = 20) {
    this.logger.log('Listando pagamentos (vendas com dados de gateway)');
    const pagination = normalizePagination(page, limit);

    const where = { gatewayId: { not: null } };

    const [data, total] = await Promise.all([
      this.prisma.venda.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          gatewayId: true,
          tipoPagamento: true,
          status: true,
          total: true,
          createdAt: true,
          cliente: {
            select: { id: true, nome: true, cpf: true },
          },
          edicao: {
            select: { id: true, numero: true },
          },
        },
      }),
      this.prisma.venda.count({ where }),
    ]);

    return buildPaginatedResponse(
      data,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Pagamentos listados com sucesso',
        emptyMessage: 'Nenhum pagamento encontrado',
      },
    );
  }

  async findOne(id: string) {
    const venda = await this.prisma.venda.findUnique({
      where: { id },
      select: {
        id: true,
        gatewayId: true,
        gatewayPayload: true,
        tipoPagamento: true,
        status: true,
        total: true,
        createdAt: true,
        cliente: {
          select: { id: true, nome: true, cpf: true },
        },
        edicao: {
          select: { id: true, numero: true },
        },
      },
    });

    if (!venda) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    return {
      message: 'Pagamento encontrado com sucesso',
      data: venda,
    };
  }

  private async enviarEmailCompraAprovada(vendaId: string): Promise<void> {
    const venda = await this.prisma.venda.findUnique({
      where: { id: vendaId },
      select: {
        total: true,
        createdAt: true,
        cliente: { select: { nome: true, email: true } },
      },
    });

    if (!venda?.cliente?.email) return;

    const linkVerNumeros = `${this.config.get<string>('FRONTEND_LOJA_URL', '')}/#/consultar-numeros`;
    const valorFormatado = `R$ ${Number(venda.total).toFixed(2).replace('.', ',')}`;
    const dataCompra = new Date(venda.createdAt).toLocaleDateString('pt-BR');

    void this.emailService.enviarCompraAprovada(venda.cliente.email, {
      nomeCliente: venda.cliente.nome,
      valorFormatado,
      dataCompra,
      formaPagamento: 'PIX',
      linkVerNumeros,
    });
  }

  private async enviarEmailCompraAprovadaSena(vendaSenaId: string): Promise<void> {
    try {
      const venda = await this.prisma.vendaSena.findUnique({
        where: { id: vendaSenaId },
        select: {
          total: true,
          createdAt: true,
          cliente: { select: { nome: true, email: true } },
        },
      });

      if (!venda?.cliente?.email) return;

      const linkVerNumeros = `${this.config.get<string>('FRONTEND_LOJA_SENA_URL', '')}/#/consultar-numeros`;
      const valorFormatado = `R$ ${Number(venda.total).toFixed(2).replace('.', ',')}`;
      const dataCompra = new Date(venda.createdAt).toLocaleDateString('pt-BR');

      void this.emailService.enviarCompraAprovadaSena(venda.cliente.email, {
        nomeCliente: venda.cliente.nome,
        valorFormatado,
        dataCompra,
        formaPagamento: 'PIX',
        linkVerNumeros,
      });
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail Sena para venda ${vendaSenaId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
