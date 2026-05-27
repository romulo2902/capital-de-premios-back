import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
  StatusEdicaoSena,
  StatusVenda,
  StatusVendaSena,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { VendasSenaService } from '../capital-sena/vendas-sena/vendas-sena.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateVendaDto } from '../vendas/dto/create-venda.dto';
import { CreateVendaSenaDto } from '../capital-sena/vendas-sena/dto/create-venda-sena.dto';
import type { CreatePosVendaDto } from './dto/create-pos-venda.dto';
import type { CreatePosVendaSenaDto } from './dto/create-pos-venda-sena.dto';
import type { ConfirmarPagamentoPosDto } from './dto/confirmar-pagamento-pos.dto';
import type { ListarCombosAdminDto } from '../vendas/dto/listar-combos-admin.dto';

/** Status de pagamento aceitos como "pago" no retorno da maquininha. */
const STATUS_PAGAMENTO_APROVADO: ReadonlySet<string> = new Set([
  'PAID',
  'APPROVED',
  'APROVADO',
]);

/**
 * Orquestra as operações do canal POS (Capital de Prêmios + Capital Sena).
 *
 * As vendas são criadas como PENDENTE (sem cobrança interna — `skipGateway`),
 * pois o pagamento é processado na maquininha. Em seguida o POS envia a resposta
 * do PagBank, que é validada antes de confirmar a venda e gerar as cartelas.
 */
@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendasService: VendasService,
    private readonly vendasSenaService: VendasSenaService,
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
    const vendaDto: CreateVendaDto = {
      ...dto,
      origemParticipacao: OrigemParticipacao.POS,
      vendedorId: user.vendedorId,
      distribuidorId: user.distribuidorId,
    };
    return this.vendasService.create(vendaDto, user, { skipGateway: true });
  }

  async confirmarPagamento(
    vendaId: string,
    dto: ConfirmarPagamentoPosDto,
    user: RequestUser,
  ) {
    const venda = await this.prisma.venda.findUnique({
      where: { id: vendaId },
      select: {
        id: true,
        status: true,
        origemParticipacao: true,
        vendedorId: true,
        distribuidorId: true,
        gatewayPayload: true,
      },
    });

    if (!venda || venda.origemParticipacao !== OrigemParticipacao.POS) {
      throw new NotFoundException('Venda POS não encontrada');
    }
    this.garantirPropriedadeVenda(venda, user);

    if (venda.status !== StatusVenda.PENDENTE) {
      throw new ForbiddenException(
        `Venda já processada (status: ${venda.status})`,
      );
    }

    const payloadPagamento = this.montarPayloadPagamento(
      venda.gatewayPayload,
      dto,
    );

    if (!this.validarPagamentoPagBank(dto)) {
      await this.prisma.venda.update({
        where: { id: venda.id },
        data: {
          status: StatusVenda.RECUSADO,
          gatewayId: dto.transacaoId,
          gatewayPayload: payloadPagamento as Prisma.InputJsonValue,
        },
      });
      this.logger.warn(
        `Pagamento POS recusado para venda ${venda.id} (transacao ${dto.transacaoId}, status ${dto.status})`,
      );
      return {
        message: 'Pagamento não aprovado. Cartelas não geradas.',
        data: { vendaId: venda.id, status: StatusVenda.RECUSADO },
      };
    }

    await this.prisma.venda.update({
      where: { id: venda.id },
      data: { gatewayId: dto.transacaoId },
    });

    return this.vendasService.confirmarPagamento(venda.id, payloadPagamento);
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
    const vendaDto: CreateVendaSenaDto = {
      ...dto,
      origemParticipacao: OrigemParticipacao.POS,
      vendedorId: user.vendedorId,
      distribuidorId: user.distribuidorId,
    };
    return this.vendasSenaService.create(vendaDto, user, { skipGateway: true });
  }

  async confirmarPagamentoSena(
    vendaSenaId: string,
    dto: ConfirmarPagamentoPosDto,
    user: RequestUser,
  ) {
    const venda = await this.prisma.vendaSena.findUnique({
      where: { id: vendaSenaId },
      select: {
        id: true,
        status: true,
        origemParticipacao: true,
        vendedorId: true,
        distribuidorId: true,
        gatewayPayload: true,
      },
    });

    if (!venda || venda.origemParticipacao !== OrigemParticipacao.POS) {
      throw new NotFoundException('Venda Sena POS não encontrada');
    }
    this.garantirPropriedadeVenda(venda, user);

    if (venda.status !== StatusVendaSena.PENDENTE) {
      throw new ForbiddenException(
        `Venda Sena já processada (status: ${venda.status})`,
      );
    }

    const payloadPagamento = this.montarPayloadPagamento(
      venda.gatewayPayload,
      dto,
    );

    if (!this.validarPagamentoPagBank(dto)) {
      await this.prisma.vendaSena.update({
        where: { id: venda.id },
        data: {
          status: StatusVendaSena.RECUSADO,
          gatewayId: dto.transacaoId,
          gatewayPayload: payloadPagamento as Prisma.InputJsonValue,
        },
      });
      this.logger.warn(
        `Pagamento POS Sena recusado para venda ${venda.id} (transacao ${dto.transacaoId}, status ${dto.status})`,
      );
      return {
        message: 'Pagamento não aprovado. Cartelas não geradas.',
        data: { vendaId: venda.id, status: StatusVendaSena.RECUSADO },
      };
    }

    await this.prisma.vendaSena.update({
      where: { id: venda.id },
      data: { gatewayId: dto.transacaoId },
    });

    return this.vendasSenaService.confirmarPagamento(venda.id, payloadPagamento);
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /**
   * Ponto de extensão para validar a resposta de pagamento no PagBank.
   *
   * TODO: consultar a transação `transacaoId` na API PagBank e confirmar que
   * foi realmente paga antes de gerar as cartelas. Hoje confia no status
   * reportado pela maquininha.
   */
  private validarPagamentoPagBank(dto: ConfirmarPagamentoPosDto): boolean {
    this.logger.warn(
      `Validação PagBank pendente — confiando no status reportado pela maquininha (transacao ${dto.transacaoId})`,
    );
    return STATUS_PAGAMENTO_APROVADO.has(dto.status.trim().toUpperCase());
  }

  private montarPayloadPagamento(
    gatewayPayloadAtual: Prisma.JsonValue | null,
    dto: ConfirmarPagamentoPosDto,
  ): Record<string, unknown> {
    const base =
      gatewayPayloadAtual &&
      typeof gatewayPayloadAtual === 'object' &&
      !Array.isArray(gatewayPayloadAtual)
        ? (gatewayPayloadAtual as Record<string, unknown>)
        : {};

    return {
      ...base,
      origem: 'POS',
      pagamentoPos: {
        transacaoId: dto.transacaoId,
        status: dto.status,
        resposta: dto.pagamento ?? null,
      },
      confirmadoEm: new Date().toISOString(),
    };
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
