import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(
    private readonly prisma: PrismaService,
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

    const evento = body['event'] as string | undefined;
    const eventosPagamento = this.extrairEventosPagamento(body);

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
