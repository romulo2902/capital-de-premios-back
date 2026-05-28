import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrigemParticipacao,
  StatusEdicao,
  StatusEdicaoSena,
  StatusVenda,
  StatusVendaSena,
  TipoPagamento,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { VendasSenaService } from '../capital-sena/vendas-sena/vendas-sena.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateVendaDto } from '../vendas/dto/create-venda.dto';
import { CreateVendaSenaDto } from '../capital-sena/vendas-sena/dto/create-venda-sena.dto';
import type { CreatePosVendaDto } from './dto/create-pos-venda.dto';
import type { CreatePosVendaSenaDto } from './dto/create-pos-venda-sena.dto';
import type { ListarCombosAdminDto } from '../vendas/dto/listar-combos-admin.dto';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';

/**
 * Orquestra as operações do canal POS (Capital de Prêmios + Capital Sena).
 *
 * As vendas são criadas como PENDENTE e a própria API cria a cobrança no gateway
 * de pagamento. A confirmação acontece pelo webhook/polling do gateway, como nos
 * demais canais digitais.
 */
@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendasService: VendasService,
    private readonly vendasSenaService: VendasSenaService,
    private readonly paymentGatewayFactory: PaymentGatewayFactory,
  ) {}

  // ─── Capital de Prêmios ───────────────────────────────────────────

  async listarEdicoesAtivas() {
    const edicoes = await this.prisma.edicao.findMany({
      where: { status: StatusEdicao.ATIVA },
      orderBy: { dataSorteio: 'asc' },
      select: {
        id: true,
        numero: true,
        frase: true,
        imagemUrl: true,
        valorCartela: true,
        dataSorteio: true,
        dataEncerramento: true,
      },
    });
    return { message: 'Edições ativas listadas com sucesso', data: edicoes };
  }

  listarCombos(edicaoId: string, filtros: ListarCombosAdminDto) {
    return this.vendasService.listarCombosDisponiveis({
      edicaoId,
      ...filtros,
      origemParticipacao: OrigemParticipacao.POS,
    });
  }

  criarVenda(dto: CreatePosVendaDto, user: RequestUser) {
    this.validarDadosPagamento(dto.tipoPagamento);
    const vendaDto: CreateVendaDto = {
      ...dto,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: user.vendedorId,
      distribuidorId: user.distribuidorId,
    };
    return this.vendasService.create(vendaDto, user, {
      origemParticipacao: OrigemParticipacao.POS,
      requireGateway: true,
    });
  }

  async consultarStatusPagamento(vendaId: string, user: RequestUser) {
    const venda = await this.prisma.venda.findUnique({
      where: { id: vendaId },
      select: {
        id: true,
        status: true,
        origemParticipacao: true,
        tipoPagamento: true,
        vendedorId: true,
        distribuidorId: true,
        gatewayId: true,
        total: true,
        createdAt: true,
      },
    });

    if (!venda || venda.origemParticipacao !== OrigemParticipacao.POS) {
      throw new NotFoundException('Venda POS não encontrada');
    }
    this.garantirPropriedadeVenda(venda, user);

    const statusGateway = await this.consultarGatewaySePossivel(
      venda.gatewayId,
      venda.tipoPagamento,
    );

    return {
      message: 'Status do pagamento POS consultado',
      data: {
        vendaId: venda.id,
        status: venda.status,
        statusLabel: this.statusVendaLabel(venda.status),
        statusGateway,
        total: venda.total.toString(),
        criadoEm: venda.createdAt,
        pago: venda.status === StatusVenda.APROVADO,
      },
    };
  }

  // ─── Capital Sena ─────────────────────────────────────────────────

  async listarEdicoesSenaAtivas() {
    const edicoes = await this.prisma.edicaoSena.findMany({
      where: { status: StatusEdicaoSena.ATIVA },
      orderBy: { dataEncerramento: 'asc' },
      select: {
        id: true,
        numero: true,
        valorCartela: true,
        dataSorteioMegaSena: true,
        dataEncerramento: true,
        combos: {
          where: { ativo: true },
          select: { id: true, nome: true, quantidade: true, preco: true },
        },
      },
    });
    return {
      message: 'Edições Sena ativas listadas com sucesso',
      data: edicoes,
    };
  }

  criarVendaSena(dto: CreatePosVendaSenaDto, user: RequestUser) {
    this.validarDadosPagamento(dto.tipoPagamento);
    const vendaDto: CreateVendaSenaDto = {
      ...dto,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: user.vendedorId,
      distribuidorId: user.distribuidorId,
    };
    return this.vendasSenaService.create(vendaDto, user, {
      origemParticipacao: OrigemParticipacao.POS,
      requireGateway: true,
    });
  }

  async consultarStatusPagamentoSena(vendaSenaId: string, user: RequestUser) {
    const venda = await this.prisma.vendaSena.findUnique({
      where: { id: vendaSenaId },
      select: {
        id: true,
        status: true,
        origemParticipacao: true,
        tipoPagamento: true,
        vendedorId: true,
        distribuidorId: true,
        gatewayId: true,
        total: true,
        createdAt: true,
      },
    });

    if (!venda || venda.origemParticipacao !== OrigemParticipacao.POS) {
      throw new NotFoundException('Venda Sena POS não encontrada');
    }
    this.garantirPropriedadeVenda(venda, user);

    const statusGateway = await this.consultarGatewaySePossivel(
      venda.gatewayId,
      venda.tipoPagamento,
    );

    return {
      message: 'Status do pagamento POS Sena consultado',
      data: {
        vendaId: venda.id,
        status: venda.status,
        statusLabel: this.statusVendaSenaLabel(venda.status),
        statusGateway,
        total: venda.total.toString(),
        criadoEm: venda.createdAt,
        pago: venda.status === StatusVendaSena.APROVADO,
      },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private validarDadosPagamento(tipoPagamento: TipoPagamento | undefined): void {
    if (tipoPagamento && tipoPagamento !== TipoPagamento.PIX) {
      throw new BadRequestException(
        'O POS aceita apenas tipoPagamento PIX por enquanto',
      );
    }
  }

  private async consultarGatewaySePossivel(
    gatewayId: string | null,
    tipoPagamento: TipoPagamento,
  ): Promise<string | undefined> {
    if (!gatewayId) {
      return undefined;
    }

    try {
      const gateway = this.paymentGatewayFactory.getGateway(tipoPagamento);
      const resultado = await gateway.consultarCobranca(gatewayId);
      return resultado.status;
    } catch (error) {
      this.logger.warn(
        `Erro ao consultar gateway POS (${gatewayId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  private statusVendaLabel(status: StatusVenda): string {
    const labels: Record<StatusVenda, string> = {
      [StatusVenda.PENDENTE]: 'Aguardando pagamento',
      [StatusVenda.APROVADO]: 'Pagamento confirmado',
      [StatusVenda.CANCELADO]: 'Pedido cancelado',
      [StatusVenda.RECUSADO]: 'Pagamento recusado',
    };
    return labels[status];
  }

  private statusVendaSenaLabel(status: StatusVendaSena): string {
    const labels: Record<StatusVendaSena, string> = {
      [StatusVendaSena.PENDENTE]: 'Aguardando pagamento',
      [StatusVendaSena.APROVADO]: 'Pagamento confirmado',
      [StatusVendaSena.CANCELADO]: 'Pedido cancelado',
      [StatusVendaSena.RECUSADO]: 'Pagamento recusado',
    };
    return labels[status];
  }

  private garantirPropriedadeVenda(
    venda: { vendedorId: string | null; distribuidorId: string | null },
    user: RequestUser,
  ): void {
    const ehDono =
      user.perfil === 'VENDEDOR'
        ? Boolean(user.vendedorId) && venda.vendedorId === user.vendedorId
        : Boolean(user.distribuidorId) &&
          venda.distribuidorId === user.distribuidorId;

    if (!ehDono) {
      throw new ForbiddenException('Venda não pertence a este operador');
    }
  }
}
