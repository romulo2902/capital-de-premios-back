import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  StatusVenda,
  StatusComissao,
  TipoCartela,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardFilterDto } from './dto/filtro-dashboard.dto';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── ADMIN DASHBOARD ────────────────────────────────────────────

  async getAdminVisaoGeral() {
    this.logger.log('Buscando visão geral (ADMIN)');
    const [totalClientes, totalVendedores, totalDistribuidores, vendedores] = await Promise.all([
      this.prisma.cliente.count(),
      this.prisma.vendedor.count(),
      this.prisma.distribuidor.count(),
      this.prisma.vendedor.findMany({
        select: {
          id: true,
          nome: true,
          vendas: {
            where: { status: StatusVenda.APROVADO },
            select: { total: true, quantidade: true, tipoCartela: true },
          },
        },
      }),
    ]);

    const rankingVendedores = vendedores
      .map((vendedor) => ({
        vendedorId: vendedor.id,
        nome: vendedor.nome,
        totalVendas: vendedor.vendas.length,
        totalCartelas: vendedor.vendas.reduce(
          (acumulado, venda) =>
            acumulado +
            calcularQuantidadeCartelasDaVenda({
              quantidade: venda.quantidade,
              tipoCartela: venda.tipoCartela,
            }),
          0,
        ),
        totalVendasValor: Number(
          vendedor.vendas
            .reduce(
              (acumulado, venda) => acumulado + Number(venda.total),
              0,
            )
            .toFixed(2),
        ),
      }))
      .filter((vendedor) => vendedor.totalVendas > 0)
      .sort((a, b) => {
        if (b.totalVendasValor !== a.totalVendasValor) {
          return b.totalVendasValor - a.totalVendasValor;
        }

        if (b.totalCartelas !== a.totalCartelas) {
          return b.totalCartelas - a.totalCartelas;
        }

        return a.nome.localeCompare(b.nome, 'pt-BR');
      })
      .slice(0, 10);

    return {
      totalClientes,
      totalVendedores,
      totalDistribuidores,
      rankingVendedores,
    };
  }

  async getAdminVendasPorEdicao() {
    this.logger.log('Buscando faturamento por edição (ADMIN)');
    const edicoes = await this.prisma.edicao.findMany({
      orderBy: { numero: 'desc' },
      take: 10,
      select: {
        id: true,
        numero: true,
        vendas: {
          where: { status: StatusVenda.APROVADO },
          select: { total: true },
        },
      },
    });

    const faturamentoAgregado = edicoes.map((e) => {
      const soma = e.vendas.reduce((acc, v) => acc + Number(v.total), 0);
      return { id: e.id, nome: `Edição ${String(e.numero).padStart(3, '0')}`, totalFaturamento: soma };
    });

    return faturamentoAgregado;
  }

  async getAdminAnaliseTimeline(filtros: DashboardFilterDto) {
    this.logger.log('Buscando análise/timeline (ADMIN)');
    const vendaWhere = this.buildTimelineWhereSemPeriodo(filtros);

    const vendas = await this.prisma.venda.findMany({
      where: vendaWhere,
      select: { createdAt: true, quantidade: true, tipoCartela: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    return this.aggregateTimeline(vendas);
  }

  // ─── DISTRIBUIDOR DASHBOARD ──────────────────────────────────────

  async getDistribuidorTimeline(user: RequestUser, filtros: DashboardFilterDto) {
    this.logger.log(`Buscando timeline de vendas para Distribuidor ${user.distribuidorId}`);
    const where = this.buildTimelineWhere(filtros);
    where.distribuidorId = user.distribuidorId;

    const vendas = await this.prisma.venda.findMany({
      where,
      select: { createdAt: true, quantidade: true, tipoCartela: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    return this.aggregateTimeline(vendas);
  }

  async getDistribuidorVendasPorVendedor(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    this.logger.log(`Buscando vendas por vendedor para Distribuidor ${user.distribuidorId}`);
    const vendasWhere = this.buildTimelineWhere(filtros);
    const vendedores = await this.prisma.vendedor.findMany({
      where: { distribuidorId: user.distribuidorId },
      select: {
        id: true,
        nome: true,
        vendas: {
          where: vendasWhere,
          select: { total: true, quantidade: true, tipoCartela: true },
        },
      },
    });

    return vendedores.map(v => ({
      vendedorId: v.id,
      nome: v.nome,
      quantidadeVendas: v.vendas.reduce(
        (acc, venda) =>
          acc +
          calcularQuantidadeCartelasDaVenda({
            quantidade: venda.quantidade,
            tipoCartela: venda.tipoCartela,
          }),
        0,
      ),
      totalFaturamento: v.vendas.reduce((acc, venda) => acc + Number(venda.total), 0),
    })).sort((a, b) => b.totalFaturamento - a.totalFaturamento);
  }

  async getDistribuidorClientesPorVendedor(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    this.logger.log(`Buscando clientes por vendedor para Distribuidor ${user.distribuidorId}`);
    const possuiFiltros =
      Boolean(filtros.edicaoIds?.length) ||
      Boolean(filtros.dataInicio) ||
      Boolean(filtros.dataFim);
    const vendedores = await this.prisma.vendedor.findMany({
      where: { distribuidorId: user.distribuidorId },
      select: {
        id: true,
        nome: true,
        ...(possuiFiltros
          ? {
              vendas: {
                where: this.buildTimelineWhere(filtros),
                select: { clienteId: true },
              },
            }
          : {
              _count: { select: { clientes: true } },
            }),
      },
      orderBy: { nome: 'asc' },
    });

    if (possuiFiltros) {
      const vendedoresComVendas = vendedores as Array<{
        id: string;
        nome: string;
        vendas: Array<{ clienteId: string }>;
      }>;

      return vendedoresComVendas.map((vendedor) => ({
        vendedorId: vendedor.id,
        nome: vendedor.nome,
        totalClientes: new Set(
          vendedor.vendas.map((venda) => venda.clienteId),
        ).size,
      }));
    }

    const vendedoresComCount = vendedores as Array<{
      id: string;
      nome: string;
      _count: { clientes: number };
    }>;

    return vendedoresComCount.map((vendedor) => ({
      vendedorId: vendedor.id,
      nome: vendedor.nome,
      totalClientes: vendedor._count.clientes,
    }));
  }

  async getDistribuidorComissoes(user: RequestUser, filtros: DashboardFilterDto) {
    this.logger.log(`Buscando comissões para Distribuidor ${user.distribuidorId}`);
    
    // A comissão real livre do distribuidor fica armazenada em ComissaoDistribuidor
    const where: Prisma.ComissaoDistribuidorWhereInput = {
      distribuidorId: user.distribuidorId,
      status: StatusComissao.PENDENTE, // Ou considerar pagos também, dependendo da tela, mas geralmente "total" inclui todos. Vamos não limitar status se for tela de dashboard geral.
    };

    if (filtros.edicaoIds) {
      const ids = filtros.edicaoIds;
      if (ids.length > 0) {
        where.venda = { edicaoId: { in: ids } };
      }
    }

    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {};
      if (filtros.dataInicio) {
        where.createdAt.gte = new Date(filtros.dataInicio);
      }
      if (filtros.dataFim) {
        const dataFim = new Date(filtros.dataFim);
        dataFim.setHours(23, 59, 59, 999);
        where.createdAt.lte = dataFim;
      }
    }

    const comissoes = await this.prisma.comissaoDistribuidor.findMany({
      where,
      select: { valor: true },
    });

    const totalVendasValor = comissoes.reduce((acc: number, c: { valor: Prisma.Decimal }) => acc + Number(c.valor), 0);
    return { totalVendasValor };
  }

  // ─── VENDEDOR DASHBOARD ──────────────────────────────────────────

  async getVendedorTimeline(user: RequestUser, filtros: DashboardFilterDto) {
    this.logger.log(`Buscando timeline de vendas para Vendedor ${user.vendedorId}`);
    const where = this.buildTimelineWhere(filtros);
    where.vendedorId = user.vendedorId;

    const vendas = await this.prisma.venda.findMany({
      where,
      select: { createdAt: true, quantidade: true, tipoCartela: true, total: true },
      orderBy: { createdAt: 'asc' },
    });

    return this.aggregateTimeline(vendas);
  }

  async getVendedorTotalClientes(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    this.logger.log(`Buscando total de clientes para Vendedor ${user.vendedorId}`);
    const possuiFiltros =
      Boolean(filtros.edicaoIds?.length) ||
      Boolean(filtros.dataInicio) ||
      Boolean(filtros.dataFim);

    const totalClientes = await this.prisma.cliente.count({
      where: possuiFiltros
        ? {
            vendedorId: user.vendedorId,
            vendas: {
              some: {
                ...this.buildTimelineWhere(filtros),
                vendedorId: user.vendedorId,
              },
            },
          }
        : { vendedorId: user.vendedorId },
    });

    return { totalClientes };
  }

  // ─── HELPERS ───────────────────────────────────────────────────

  private buildTimelineWhere(filtros: DashboardFilterDto): Prisma.VendaWhereInput {
    const where: Prisma.VendaWhereInput = { status: StatusVenda.APROVADO };

    if (filtros.edicaoIds) {
      const ids = filtros.edicaoIds;
      if (ids.length > 0) {
        where.edicaoId = { in: ids };
      }
    }

    if (filtros.dataInicio || filtros.dataFim) {
      where.createdAt = {};
      if (filtros.dataInicio) {
        where.createdAt.gte = new Date(filtros.dataInicio);
      }
      if (filtros.dataFim) {
        const dataFim = new Date(filtros.dataFim);
        dataFim.setHours(23, 59, 59, 999);
        where.createdAt.lte = dataFim;
      }
    }

    return where;
  }

  private buildTimelineWhereSemPeriodo(
    filtros: DashboardFilterDto,
  ): Prisma.VendaWhereInput {
    const where: Prisma.VendaWhereInput = { status: StatusVenda.APROVADO };

    if (filtros.edicaoIds) {
      const ids = filtros.edicaoIds;
      if (ids.length > 0) {
        where.edicaoId = { in: ids };
      }
    }

    return where;
  }

  private aggregateTimeline(
    vendas: {
      createdAt: Date;
      quantidade: number;
      tipoCartela?: TipoCartela | null;
      total: Prisma.Decimal;
    }[],
  ) {
    const dailyMap = new Map<string, { dia: string; cartelas: number; totalR$: number }>();
    let totalAcumuladoR$ = 0;
    let totalCartelasAcumulado = 0;

    for (const v of vendas) {
      // Usar a string YYYY-MM-DD
      const diaStr = v.createdAt.toISOString().slice(0, 10);

      const cartelas = calcularQuantidadeCartelasDaVenda({
        quantidade: v.quantidade,
        tipoCartela: v.tipoCartela ?? null,
      });
      const t = Number(v.total);

      totalAcumuladoR$ += t;
      totalCartelasAcumulado += cartelas;

      if (!dailyMap.has(diaStr)) {
        dailyMap.set(diaStr, { dia: diaStr, cartelas: 0, totalR$: 0 });
      }

      const dayData = dailyMap.get(diaStr)!;
      dayData.cartelas += cartelas;
      dayData.totalR$ += t;
    }

    const timeline = Array.from(dailyMap.values()).map(d => ({
      dia: d.dia,
      cartelas: d.cartelas,
      totalRS: Number(d.totalR$.toFixed(2))
    }));

    return { 
      resumo: { totalAcumuladoRS: Number(totalAcumuladoR$.toFixed(2)), totalCartelasAcumulado },
      timeline 
    };
  }
}
