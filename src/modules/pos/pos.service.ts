import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  OrigemParticipacao,
  StatusEdicao,
  StatusEdicaoSena,
  StatusVenda,
  StatusVendaSena,
  TipoCartela,
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
import { RedisService } from '../../common/redis/redis.service';
import { obterQuantidadeCartelas } from '../edicoes/edicoes-range.util';
import type { ReservarCartelasPosDto } from './dto/reservar-cartelas-pos.dto';

const POS_RESERVA_TTL_SEGUNDOS = 300;
const POS_PRE_COMPRA_TTL_SEGUNDOS = 1800;

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
    private readonly redisService: RedisService,
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

  async listarOpcoesVenda(edicaoId: string) {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      select: {
        id: true,
        numero: true,
        status: true,
        valorCartela: true,
        detalhes: {
          where: { origemParticipacao: OrigemParticipacao.DIGITAL },
          select: { tipoCartela: true, preco: true, indiceRange: true },
          orderBy: { indiceRange: 'asc' },
        },
        combos: {
          where: { origemParticipacao: OrigemParticipacao.DIGITAL },
          select: { tipoCartela: true, preco: true },
          orderBy: { tipoCartela: 'asc' },
        },
      },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada');
    }

    if (edicao.status !== StatusEdicao.ATIVA) {
      throw new BadRequestException('A edição não está ativa');
    }

    const opcoesUnitarias = edicao.detalhes
      .filter((detalhe) => detalhe.tipoCartela === TipoCartela.UMA_CHANCE)
      .map((detalhe) => ({
        tipoCompra: 'UNITARIO',
        tipoCartela: detalhe.tipoCartela,
        quantidadeCartelas: 1,
        preco: (detalhe.preco ?? edicao.valorCartela).toString(),
        indiceRange: detalhe.indiceRange,
      }));

    const opcoesCombos = edicao.combos.map((combo) => ({
      tipoCompra: 'COMBO',
      tipoCartela: combo.tipoCartela,
      quantidadeCartelas: obterQuantidadeCartelas(combo.tipoCartela),
      preco: combo.preco.toString(),
      indiceRange: null,
    }));

    return {
      message: 'Opções de venda POS listadas com sucesso',
      data: {
        edicaoId: edicao.id,
        edicaoNumero: edicao.numero,
        origemParticipacao: OrigemParticipacao.POS,
        opcoes: [...opcoesUnitarias, ...opcoesCombos],
      },
    };
  }

  async listarCombos(edicaoId: string, filtros: ListarCombosAdminDto) {
    const numerosReservados = await this.listarNumerosReservados(edicaoId);
    return this.vendasService.listarCombosDisponiveis({
      edicaoId,
      ...filtros,
      origemParticipacao: OrigemParticipacao.DIGITAL,
      numerosReservados,
    });
  }

  async reservarCartelas(
    edicaoId: string,
    dto: ReservarCartelasPosDto,
    user: RequestUser,
  ) {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      select: { id: true, numero: true, status: true },
    });

    if (!edicao) {
      throw new NotFoundException('Edição não encontrada');
    }

    if (edicao.status !== StatusEdicao.ATIVA) {
      throw new BadRequestException('A edição não está ativa');
    }

    const numeros = this.normalizarNumerosReserva(dto.cartelas);
    const comprados = await this.prisma.bilhete.findMany({
      where: {
        edicaoId: edicao.id,
        numero: { in: numeros.map((numero) => BigInt(numero)) },
      },
      select: { numero: true },
    });

    if (comprados.length > 0) {
      throw new ConflictException(
        'Algumas cartelas selecionadas já foram vendidas',
      );
    }

    await this.reservarNumerosNoRedis(
      edicao.id,
      numeros,
      user,
      POS_RESERVA_TTL_SEGUNDOS,
    );

    return {
      message: 'Cartelas reservadas para pré-compra POS',
      data: {
        edicaoId: edicao.id,
        edicaoNumero: edicao.numero,
        reservadas: numeros.length,
        cartelas: numeros.map((numero) => this.formatarNumeroBilhete(numero)),
        expiresIn: POS_RESERVA_TTL_SEGUNDOS,
      },
    };
  }

  async criarVenda(dto: CreatePosVendaDto, user: RequestUser) {
    this.validarDadosPagamento(dto.tipoPagamento);
    await this.garantirReservasSelecionadas(dto, user);
    const vendaDto: CreateVendaDto = {
      ...dto,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: user.vendedorId,
      distribuidorId: user.distribuidorId,
    };
    const result = await this.vendasService.create(vendaDto, user, {
      origemParticipacao: OrigemParticipacao.POS,
      requireGateway: true,
    });
    await this.estenderReservasSelecionadas(dto, user);
    return result;
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

  private async listarNumerosReservados(edicaoId: string): Promise<string[]> {
    if (!this.redisService.isConfigured() || !this.redisService.client) {
      return [];
    }

    const keys = await this.redisService.client.keys(`reserva:${edicaoId}:*`);
    return keys
      .map((key) => key.split(':').pop())
      .filter((numero): numero is string => Boolean(numero))
      .map((numero) => BigInt(numero).toString());
  }

  private normalizarNumerosReserva(cartelas: string[]): string[] {
    return Array.from(
      new Set(
        cartelas.map((numero) => {
          const digits = numero.replace(/\D/g, '');
          if (!digits) {
            throw new BadRequestException('Cartela inválida para reserva');
          }
          return BigInt(digits).toString();
        }),
      ),
    );
  }

  private async reservarNumerosNoRedis(
    edicaoId: string,
    numeros: string[],
    user: RequestUser,
    ttlSegundos: number,
  ): Promise<void> {
    if (!this.redisService.isConfigured() || !this.redisService.client) {
      throw new ServiceUnavailableException(
        'Reservas POS exigem Redis configurado',
      );
    }

    const redis = this.redisService.client;
    const valorReserva = JSON.stringify({
      origem: 'POS',
      operadorId: user.id,
      perfil: user.perfil,
      vendedorId: user.vendedorId ?? null,
      distribuidorId: user.distribuidorId ?? null,
      criadoEm: new Date().toISOString(),
    });
    const keysCriadas: string[] = [];

    for (const numero of numeros) {
      const key = this.montarChaveReserva(edicaoId, numero);
      const resultado = await redis.set(
        key,
        valorReserva,
        'EX',
        ttlSegundos,
        'NX',
      );

      if (resultado === 'OK') {
        keysCriadas.push(key);
        continue;
      }

      const reservaAtual = await redis.get(key);
      if (this.reservaPertenceAoOperador(reservaAtual, user)) {
        await redis.setex(key, ttlSegundos, valorReserva);
        continue;
      }

      if (keysCriadas.length > 0) {
        await redis.del(...keysCriadas);
      }
      throw new ConflictException(
        `Cartela ${this.formatarNumeroBilhete(numero)} já está reservada em outra pré-compra`,
      );
    }
  }

  private async garantirReservasSelecionadas(
    dto: CreatePosVendaDto,
    user: RequestUser,
  ): Promise<void> {
    const numerosSelecionados = [
      ...(dto.cartelasSelecionadas ?? []),
      ...(dto.combosSelecionados ?? []),
    ];

    if (!dto.edicaoId || numerosSelecionados.length === 0) {
      return;
    }

    const numeros = this.normalizarNumerosReserva(numerosSelecionados);
    if (!this.redisService.isConfigured() || !this.redisService.client) {
      throw new ServiceUnavailableException(
        'Reservas POS exigem Redis configurado',
      );
    }

    for (const numero of numeros) {
      const key = this.montarChaveReserva(dto.edicaoId, numero);
      const reservaAtual = await this.redisService.client.get(key);
      if (!this.reservaPertenceAoOperador(reservaAtual, user)) {
        throw new ConflictException(
          `Cartela ${this.formatarNumeroBilhete(numero)} não está reservada para este operador`,
        );
      }
    }
  }

  private async estenderReservasSelecionadas(
    dto: CreatePosVendaDto,
    user: RequestUser,
  ): Promise<void> {
    const numerosSelecionados = [
      ...(dto.cartelasSelecionadas ?? []),
      ...(dto.combosSelecionados ?? []),
    ];

    if (!dto.edicaoId || numerosSelecionados.length === 0) {
      return;
    }

    await this.estenderReservasDoOperador(
      dto.edicaoId,
      user,
      POS_PRE_COMPRA_TTL_SEGUNDOS,
    );
  }

  private montarChaveReserva(edicaoId: string, numero: string): string {
    return `reserva:${edicaoId}:${numero}`;
  }

  private reservaPertenceAoOperador(
    reserva: string | null,
    user: RequestUser,
  ): boolean {
    if (!reserva) {
      return false;
    }

    try {
      const parsed = JSON.parse(reserva) as { operadorId?: unknown };
      return parsed.operadorId === user.id;
    } catch {
      return false;
    }
  }

  private async estenderReservasDoOperador(
    edicaoId: string,
    user: RequestUser,
    ttlSegundos: number,
  ): Promise<void> {
    if (!this.redisService.isConfigured() || !this.redisService.client) {
      return;
    }

    const redis = this.redisService.client;
    const keys = await redis.keys(`reserva:${edicaoId}:*`);
    const valorReserva = JSON.stringify({
      origem: 'POS',
      operadorId: user.id,
      perfil: user.perfil,
      vendedorId: user.vendedorId ?? null,
      distribuidorId: user.distribuidorId ?? null,
      criadoEm: new Date().toISOString(),
    });

    for (const key of keys) {
      const reservaAtual = await redis.get(key);
      if (this.reservaPertenceAoOperador(reservaAtual, user)) {
        await redis.setex(key, ttlSegundos, valorReserva);
      }
    }
  }

  private formatarNumeroBilhete(numero: string): string {
    return numero.padStart(7, '0');
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
