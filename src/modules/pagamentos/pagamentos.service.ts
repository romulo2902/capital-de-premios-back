import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StatusVenda } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { VendasService } from '../vendas/vendas.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

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
    private readonly vendasService: VendasService,
    private readonly distributedLock: DistributedLockService,
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

        if (!venda) {
          this.logger.warn(
            `Venda não encontrada para gatewayId/reference_id: ${identificador}`,
          );
          resultados.push({
            gatewayId: identificador,
            status: 'VENDA_NAO_ENCONTRADA',
          });
          continue;
        }

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
        resultados.push({ gatewayId: identificador, status: 'CONFIRMADA' });
        this.logger.log(
          `Pagamento confirmado via webhook PagBank para venda ${venda.id}`,
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
        return identificador
          ? [
              {
                identificador,
                status: this.lerString(charge, 'status'),
                referenceId: this.lerString(charge, 'reference_id'),
                chargeId: identificador,
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

    const gateway = this.paymentGatewayFactory.getGateway(venda.tipoPagamento);
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
}
