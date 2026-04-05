import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { VendasService } from '../vendas/vendas.service';
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
  ) {}

  // ─── WEBHOOK PIX (Inter) ──────────────────────────────

  async processarWebhookPix(body: Record<string, unknown>) {
    this.logger.log(`Webhook PIX recebido: ${JSON.stringify(body)}`);

    // O Inter envia o webhook com a lista de pix pagos
    const pixArray = body['pix'] as Array<Record<string, unknown>> | undefined;

    if (!pixArray || !Array.isArray(pixArray) || pixArray.length === 0) {
      this.logger.warn('Webhook PIX sem dados de pagamento');
      return { message: 'Webhook recebido (sem dados de pagamento)' };
    }

    const resultados: Array<{ txid: string; status: string }> = [];

    for (const pix of pixArray) {
      const txid = pix['txid'] as string | undefined;

      if (!txid) {
        this.logger.warn('Pix sem txid no webhook');
        continue;
      }

      // Buscar venda pelo gatewayId (que é o txid)
      const venda = await this.prisma.venda.findFirst({
        where: { gatewayId: txid },
        select: { id: true, status: true },
      });

      if (!venda) {
        this.logger.warn(`Venda não encontrada para txid: ${txid}`);
        resultados.push({ txid, status: 'VENDA_NAO_ENCONTRADA' });
        continue;
      }

      if (venda.status !== 'PENDENTE') {
        this.logger.log(`Venda ${venda.id} já processada (status: ${venda.status})`);
        resultados.push({ txid, status: 'JA_PROCESSADA' });
        continue;
      }

      try {
        await this.vendasService.confirmarPagamento(
          venda.id,
          pix as Record<string, unknown>,
        );
        resultados.push({ txid, status: 'CONFIRMADA' });
        this.logger.log(`Pagamento confirmado via webhook para venda ${venda.id}`);
      } catch (error) {
        this.logger.error(
          `Erro ao confirmar pagamento da venda ${venda.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        resultados.push({ txid, status: 'ERRO' });
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
