import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { VendasService } from '../vendas/vendas.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

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
  // O PagBank envia eventos no formato:
  // { "event": "CHARGE.PAID", "charges": [{ "id": "CHAR_...", "status": "PAID", ... }] }
  //
  // O gatewayId no banco é o `charge.id` retornado na criação da cobrança.

  private async processarWebhookPagBank(body: Record<string, unknown>) {
    if (!body) {
      this.logger.warn('Webhook PagBank recebido com body vazio ou nulo.');
      return { message: 'Webhook recebido (sem dados)' };
    }

    const evento = body['event'] as string | undefined;
    const charges = body['charges'] as
      | Array<Record<string, unknown>>
      | undefined;

    if (!charges || !Array.isArray(charges) || charges.length === 0) {
      this.logger.warn(
        `Webhook PagBank sem charges (event=${evento ?? 'N/A'})`,
      );
      return { message: 'Webhook recebido (sem dados de pagamento)' };
    }

    const resultados: Array<{ chargeId: string; status: string }> = [];

    for (const charge of charges) {
      const chargeId = charge['id'] as string | undefined;
      const chargeStatus = charge['status'] as string | undefined;

      if (!chargeId) {
        this.logger.warn('Charge sem id no webhook PagBank');
        continue;
      }

      // Processar apenas cobranças pagas
      if (chargeStatus !== 'PAID') {
        this.logger.log(
          `Charge ${chargeId} ignorada (status=${chargeStatus ?? 'N/A'})`,
        );
        resultados.push({ chargeId, status: `IGNORADO_${chargeStatus ?? 'DESCONHECIDO'}` });
        continue;
      }

      const lockKey = `lock:pagbank:webhook:${chargeId}`;
      const lock = await this.distributedLock.acquire(lockKey, 30_000);
      if (!lock) {
        this.logger.warn(
          `Webhook PagBank ignorado temporariamente para chargeId ${chargeId} (já em processamento em outra instância)`,
        );
        resultados.push({ chargeId, status: 'EM_PROCESSAMENTO' });
        continue;
      }

      try {
        const venda = await this.prisma.venda.findFirst({
          where: { gatewayId: chargeId },
          select: { id: true, status: true },
        });

        if (!venda) {
          this.logger.warn(`Venda não encontrada para chargeId: ${chargeId}`);
          resultados.push({ chargeId, status: 'VENDA_NAO_ENCONTRADA' });
          continue;
        }

        if (venda.status !== 'PENDENTE') {
          this.logger.log(
            `Venda ${venda.id} já processada (status: ${venda.status})`,
          );
          resultados.push({ chargeId, status: 'JA_PROCESSADA' });
          continue;
        }

        await this.vendasService.confirmarPagamento(
          venda.id,
          charge as Record<string, unknown>,
        );
        resultados.push({ chargeId, status: 'CONFIRMADA' });
        this.logger.log(
          `Pagamento confirmado via webhook PagBank para venda ${venda.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Erro ao confirmar pagamento por chargeId ${chargeId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        resultados.push({ chargeId, status: 'ERRO' });
      } finally {
        await this.distributedLock.release(lock);
      }
    }

    return {
      message: 'Webhook processado',
      data: resultados,
    };
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
