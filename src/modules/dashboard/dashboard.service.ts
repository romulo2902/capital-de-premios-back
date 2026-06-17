import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  Perfil,
  Prisma,
  StatusComissao,
  StatusVenda,
  StatusVendaSena,
  TipoCartela,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DashboardDataTipo,
  DashboardFilterDto,
} from './dto/filtro-dashboard.dto';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { calcularQuantidadeCartelasDaVenda } from '../vendas/vendas-quantidade.util';

type DashboardModo = 'CDP' | 'SENA';

type TimelineVenda = {
  createdAt: Date;
  quantidade: number;
  tipoCartela?: TipoCartela | null;
  total: Prisma.Decimal;
};

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAdminVisaoGeral(filtros: DashboardFilterDto = {}) {
    const modo = this.resolveModo(filtros);
    this.logger.log(`Buscando visão geral (ADMIN) — modo ${modo}`);

    if (modo === 'SENA') {
      const [totalClientes, totalVendedores, totalDistribuidores, vendedores] =
        await Promise.all([
          this.prisma.cliente.count({
            where: { vendasSena: { some: { status: StatusVendaSena.APROVADO } } },
          }),
          this.prisma.vendedor.count({
            where: { vendasSena: { some: { status: StatusVendaSena.APROVADO } } },
          }),
          this.prisma.distribuidor.count({
            where: {
              vendedores: {
                some: {
                  vendasSena: { some: { status: StatusVendaSena.APROVADO } },
                },
              },
            },
          }),
          this.prisma.vendedor.findMany({
            select: {
              id: true,
              nome: true,
              vendasSena: {
                where: { status: StatusVendaSena.APROVADO },
                select: { total: true, quantidade: true },
              },
            },
          }),
        ]);

      const rankingVendedores = vendedores
        .map((vendedor) => ({
          vendedorId: vendedor.id,
          nome: vendedor.nome,
          totalVendas: vendedor.vendasSena.length,
          totalCartelas: vendedor.vendasSena.reduce(
            (acumulado, venda) =>
              acumulado +
              calcularQuantidadeCartelasDaVenda({
                quantidade: venda.quantidade,
                tipoCartela: null,
              }),
            0,
          ),
          totalVendasValor: Number(
            vendedor.vendasSena
              .reduce((acumulado, venda) => acumulado + Number(venda.total), 0)
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

    const [totalClientes, totalVendedores, totalDistribuidores, vendedores] =
      await Promise.all([
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
            .reduce((acumulado, venda) => acumulado + Number(venda.total), 0)
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

  async getAdminVendasPorEdicao(filtros: DashboardFilterDto = {}) {
    const modo = this.resolveModo(filtros);
    this.logger.log(`Buscando faturamento por edição (ADMIN) — modo ${modo}`);

    if (modo === 'SENA') {
      const edicoes = await this.prisma.edicaoSena.findMany({
        orderBy: { numero: 'desc' },
        take: 10,
        select: {
          id: true,
          numero: true,
          vendas: {
            where: { status: StatusVendaSena.APROVADO },
            select: { total: true },
          },
        },
      });

      return edicoes.map((edicao) => ({
        id: edicao.id,
        nome: `Edição ${String(edicao.numero).padStart(3, '0')}`,
        totalFaturamento: edicao.vendas.reduce(
          (acc, venda) => acc + Number(venda.total),
          0,
        ),
      }));
    }

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

    return edicoes.map((edicao) => ({
      id: edicao.id,
      nome: `Edição ${String(edicao.numero).padStart(3, '0')}`,
      totalFaturamento: edicao.vendas.reduce(
        (acc, venda) => acc + Number(venda.total),
        0,
      ),
    }));
  }

  async getAdminAnaliseTimeline(filtros: DashboardFilterDto) {
    const modo = this.resolveModo(filtros);
    this.logger.log(`Buscando análise/timeline (ADMIN) — modo ${modo}`);

    if (modo === 'SENA') {
      const vendas = await this.prisma.vendaSena.findMany({
        where: this.buildTimelineWhereSemPeriodoSena(filtros),
        select: {
          createdAt: true,
          quantidade: true,
          total: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return this.aggregateTimeline(vendas);
    }

    const vendas = await this.prisma.venda.findMany({
      where: this.buildTimelineWhereSemPeriodoCdp(filtros),
      select: {
        createdAt: true,
        quantidade: true,
        tipoCartela: true,
        total: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.aggregateTimeline(vendas);
  }

  async getEdicoesDisponiveis(
    user: RequestUser,
    filtros: DashboardFilterDto = {},
  ) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando edições disponíveis no dashboard para perfil ${user.perfil} — modo ${modo}`,
    );

    if (modo === 'SENA') {
      if (user.perfil === Perfil.DISTRIBUIDOR) {
        const edicoes = await this.prisma.edicaoSena.findMany({
          where: {
            vendas: {
              some: {
                status: StatusVendaSena.APROVADO,
                distribuidorId: user.distribuidorId,
              },
            },
          },
          orderBy: [{ dataSorteioMegaSena: 'desc' }, { numero: 'desc' }],
          select: {
            id: true,
            numero: true,
            status: true,
            dataSorteioMegaSena: true,
            dataEncerramento: true,
          },
        });

        return edicoes.map((edicao) =>
          this.mapEdicaoFiltro({
            id: edicao.id,
            numero: edicao.numero,
            status: edicao.status,
            dataSorteio: edicao.dataSorteioMegaSena,
            dataEncerramento: edicao.dataEncerramento,
          }),
        );
      }

      if (user.perfil !== Perfil.VENDEDOR) {
        throw new ForbiddenException('Perfil sem acesso às edições do dashboard');
      }

      const edicoes = await this.prisma.edicaoSena.findMany({
        where: {
          vendas: {
            some: {
              status: StatusVendaSena.APROVADO,
              vendedorId: user.vendedorId,
            },
          },
        },
        orderBy: [{ dataSorteioMegaSena: 'desc' }, { numero: 'desc' }],
        select: {
          id: true,
          numero: true,
          status: true,
          dataSorteioMegaSena: true,
          dataEncerramento: true,
        },
      });

      return edicoes.map((edicao) =>
        this.mapEdicaoFiltro({
          id: edicao.id,
          numero: edicao.numero,
          status: edicao.status,
          dataSorteio: edicao.dataSorteioMegaSena,
          dataEncerramento: edicao.dataEncerramento,
        }),
      );
    }

    if (user.perfil === Perfil.DISTRIBUIDOR) {
      const edicoes = await this.prisma.edicao.findMany({
        where: {
          vendas: {
            some: {
              status: StatusVenda.APROVADO,
              distribuidorId: user.distribuidorId,
            },
          },
        },
        orderBy: [{ dataSorteio: 'desc' }, { numero: 'desc' }],
        select: {
          id: true,
          numero: true,
          status: true,
          dataSorteio: true,
          dataEncerramento: true,
        },
      });

      return edicoes.map((edicao) => this.mapEdicaoFiltro(edicao));
    }

    if (user.perfil !== Perfil.VENDEDOR) {
      throw new ForbiddenException('Perfil sem acesso às edições do dashboard');
    }

    const edicoes = await this.prisma.edicao.findMany({
      where: {
        vendas: {
          some: {
            status: StatusVenda.APROVADO,
            vendedorId: user.vendedorId,
          },
        },
      },
      orderBy: [{ dataSorteio: 'desc' }, { numero: 'desc' }],
      select: {
        id: true,
        numero: true,
        status: true,
        dataSorteio: true,
        dataEncerramento: true,
      },
    });

    return edicoes.map((edicao) => this.mapEdicaoFiltro(edicao));
  }

  async getDistribuidorTimeline(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando timeline de vendas para Distribuidor ${user.distribuidorId} — modo ${modo}`,
    );

    if (modo === 'SENA') {
      const where = this.buildTimelineWhereSena(filtros);
      where.distribuidorId = user.distribuidorId;

      const vendas = await this.prisma.vendaSena.findMany({
        where,
        select: {
          createdAt: true,
          quantidade: true,
          total: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return this.aggregateTimeline(vendas);
    }

    const where = this.buildTimelineWhereCdp(filtros);
    where.distribuidorId = user.distribuidorId;

    const vendas = await this.prisma.venda.findMany({
      where,
      select: {
        createdAt: true,
        quantidade: true,
        tipoCartela: true,
        total: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.aggregateTimeline(vendas);
  }

  async getDistribuidorVendasPorVendedor(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando vendas por vendedor para Distribuidor ${user.distribuidorId} — modo ${modo}`,
    );

    if (modo === 'SENA') {
      const vendasWhere = this.buildTimelineWhereSena(filtros);
      const vendedores = await this.prisma.vendedor.findMany({
        where: { distribuidorId: user.distribuidorId },
        select: {
          id: true,
          nome: true,
          vendasSena: {
            where: vendasWhere,
            select: { total: true, quantidade: true },
          },
        },
      });

      return vendedores
        .map((vendedor) => ({
          vendedorId: vendedor.id,
          nome: vendedor.nome,
          quantidadeVendas: vendedor.vendasSena.reduce(
            (acc, venda) =>
              acc +
              calcularQuantidadeCartelasDaVenda({
                quantidade: venda.quantidade,
                tipoCartela: null,
              }),
            0,
          ),
          totalFaturamento: vendedor.vendasSena.reduce(
            (acc, venda) => acc + Number(venda.total),
            0,
          ),
        }))
        .sort((a, b) => b.totalFaturamento - a.totalFaturamento);
    }

    const vendasWhere = this.buildTimelineWhereCdp(filtros);
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

    return vendedores
      .map((vendedor) => ({
        vendedorId: vendedor.id,
        nome: vendedor.nome,
        quantidadeVendas: vendedor.vendas.reduce(
          (acc, venda) =>
            acc +
            calcularQuantidadeCartelasDaVenda({
              quantidade: venda.quantidade,
              tipoCartela: venda.tipoCartela,
            }),
          0,
        ),
        totalFaturamento: vendedor.vendas.reduce(
          (acc, venda) => acc + Number(venda.total),
          0,
        ),
      }))
      .sort((a, b) => b.totalFaturamento - a.totalFaturamento);
  }

  async getDistribuidorClientesPorVendedor(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando clientes por vendedor para Distribuidor ${user.distribuidorId} — modo ${modo}`,
    );
    const possuiFiltros =
      Boolean(filtros.edicaoIds?.length) ||
      Boolean(filtros.dataInicio) ||
      Boolean(filtros.dataFim);

    if (modo === 'SENA') {
      const vendedores = await this.prisma.vendedor.findMany({
        where: { distribuidorId: user.distribuidorId },
        select: {
          id: true,
          nome: true,
          ...(possuiFiltros
            ? {
                vendasSena: {
                  where: this.buildTimelineWhereSena(filtros),
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
          vendasSena: Array<{ clienteId: string }>;
        }>;

        return vendedoresComVendas.map((vendedor) => ({
          vendedorId: vendedor.id,
          nome: vendedor.nome,
          totalClientes: new Set(
            vendedor.vendasSena.map((venda) => venda.clienteId),
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

    const vendedores = await this.prisma.vendedor.findMany({
      where: { distribuidorId: user.distribuidorId },
      select: {
        id: true,
        nome: true,
        ...(possuiFiltros
          ? {
              vendas: {
                where: this.buildTimelineWhereCdp(filtros),
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
        totalClientes: new Set(vendedor.vendas.map((venda) => venda.clienteId))
          .size,
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

  async getDistribuidorComissoes(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando comissões para Distribuidor ${user.distribuidorId} — modo ${modo}`,
    );

    if (modo === 'SENA') {
      const [vendas, comissoes] = await Promise.all([
        this.prisma.vendaSena.findMany({
          where: {
            ...this.buildTimelineWhereSena(filtros),
            distribuidorId: user.distribuidorId,
          },
          select: { total: true },
        }),
        this.prisma.comissaoDistribuidorSena.findMany({
          where: this.buildDistribuidorComissaoWhereSena(user, filtros),
          select: { valor: true },
        }),
      ]);

      return this.mapTotaisVendasEComissoes(vendas, comissoes);
    }

    const [vendas, comissoes] = await Promise.all([
      this.prisma.venda.findMany({
        where: {
          ...this.buildTimelineWhereCdp(filtros),
          distribuidorId: user.distribuidorId,
        },
        select: { total: true },
      }),
      this.prisma.comissaoDistribuidor.findMany({
        where: this.buildDistribuidorComissaoWhereCdp(user, filtros),
        select: { valor: true },
      }),
    ]);

    return this.mapTotaisVendasEComissoes(vendas, comissoes);
  }

  async getVendedorTimeline(user: RequestUser, filtros: DashboardFilterDto) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando timeline de vendas para Vendedor ${user.vendedorId} — modo ${modo}`,
    );

    if (modo === 'SENA') {
      const where = this.buildTimelineWhereSena(filtros);
      where.vendedorId = user.vendedorId;

      const vendas = await this.prisma.vendaSena.findMany({
        where,
        select: {
          createdAt: true,
          quantidade: true,
          total: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      return this.aggregateTimeline(vendas);
    }

    const where = this.buildTimelineWhereCdp(filtros);
    where.vendedorId = user.vendedorId;

    const vendas = await this.prisma.venda.findMany({
      where,
      select: {
        createdAt: true,
        quantidade: true,
        tipoCartela: true,
        total: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.aggregateTimeline(vendas);
  }

  async getVendedorComissoes(user: RequestUser, filtros: DashboardFilterDto) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando comissões para Vendedor ${user.vendedorId} — modo ${modo}`,
    );

    if (modo === 'SENA') {
      const [vendas, comissoes] = await Promise.all([
        this.prisma.vendaSena.findMany({
          where: {
            ...this.buildTimelineWhereSena(filtros),
            vendedorId: user.vendedorId,
          },
          select: { total: true },
        }),
        this.prisma.comissaoSena.findMany({
          where: this.buildVendedorComissaoWhereSena(user, filtros),
          select: { valor: true },
        }),
      ]);

      return this.mapTotaisVendasEComissoes(vendas, comissoes);
    }

    const [vendas, comissoes] = await Promise.all([
      this.prisma.venda.findMany({
        where: {
          ...this.buildTimelineWhereCdp(filtros),
          vendedorId: user.vendedorId,
        },
        select: { total: true },
      }),
      this.prisma.comissao.findMany({
        where: this.buildVendedorComissaoWhereCdp(user, filtros),
        select: { valor: true },
      }),
    ]);

    return this.mapTotaisVendasEComissoes(vendas, comissoes);
  }

  async getVendedorTotalClientes(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ) {
    const modo = this.resolveModo(filtros);
    this.logger.log(
      `Buscando total de clientes para Vendedor ${user.vendedorId} — modo ${modo}`,
    );
    const possuiFiltros =
      Boolean(filtros.edicaoIds?.length) ||
      Boolean(filtros.dataInicio) ||
      Boolean(filtros.dataFim);

    if (modo === 'SENA') {
      const [totalClientes, vendas, comissoes] = await Promise.all([
        this.prisma.cliente.count({
          where: possuiFiltros
            ? {
                vendedorId: user.vendedorId,
                vendasSena: {
                  some: {
                    ...this.buildTimelineWhereSena(filtros),
                    vendedorId: user.vendedorId,
                  },
                },
              }
            : { vendedorId: user.vendedorId },
        }),
        this.prisma.vendaSena.findMany({
          where: {
            ...this.buildTimelineWhereSena(filtros),
            vendedorId: user.vendedorId,
          },
          select: { total: true },
        }),
        this.prisma.comissaoSena.findMany({
          where: this.buildVendedorComissaoWhereSena(user, filtros),
          select: { valor: true },
        }),
      ]);

      const totais = this.mapTotaisVendasEComissoes(vendas, comissoes);
      return {
        totalClientes,
        ...totais,
      };
    }

    const [totalClientes, vendas, comissoes] = await Promise.all([
      this.prisma.cliente.count({
        where: possuiFiltros
          ? {
              vendedorId: user.vendedorId,
              vendas: {
                some: {
                  ...this.buildTimelineWhereCdp(filtros),
                  vendedorId: user.vendedorId,
                },
              },
            }
          : { vendedorId: user.vendedorId },
      }),
      this.prisma.venda.findMany({
        where: {
          ...this.buildTimelineWhereCdp(filtros),
          vendedorId: user.vendedorId,
        },
        select: { total: true },
      }),
      this.prisma.comissao.findMany({
        where: this.buildVendedorComissaoWhereCdp(user, filtros),
        select: { valor: true },
      }),
    ]);

    const totais = this.mapTotaisVendasEComissoes(vendas, comissoes);
    return {
      totalClientes,
      ...totais,
    };
  }

  private resolveModo(filtros?: DashboardFilterDto): DashboardModo {
    return filtros?.tipo === DashboardDataTipo.SENA ? 'SENA' : 'CDP';
  }

  private buildTimelineWhereCdp(
    filtros: DashboardFilterDto,
  ): Prisma.VendaWhereInput {
    const where: Prisma.VendaWhereInput = { status: StatusVenda.APROVADO };

    if (filtros.edicaoIds?.length) {
      where.edicaoId = { in: filtros.edicaoIds };
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

  private buildTimelineWhereSemPeriodoCdp(
    filtros: DashboardFilterDto,
  ): Prisma.VendaWhereInput {
    const where: Prisma.VendaWhereInput = { status: StatusVenda.APROVADO };

    if (filtros.edicaoIds?.length) {
      where.edicaoId = { in: filtros.edicaoIds };
    }

    return where;
  }

  private buildTimelineWhereSena(
    filtros: DashboardFilterDto,
  ): Prisma.VendaSenaWhereInput {
    const where: Prisma.VendaSenaWhereInput = {
      status: StatusVendaSena.APROVADO,
    };

    if (filtros.edicaoIds?.length) {
      where.edicaoSenaId = { in: filtros.edicaoIds };
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

  private buildTimelineWhereSemPeriodoSena(
    filtros: DashboardFilterDto,
  ): Prisma.VendaSenaWhereInput {
    const where: Prisma.VendaSenaWhereInput = {
      status: StatusVendaSena.APROVADO,
    };

    if (filtros.edicaoIds?.length) {
      where.edicaoSenaId = { in: filtros.edicaoIds };
    }

    return where;
  }

  private buildDistribuidorComissaoWhereCdp(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ): Prisma.ComissaoDistribuidorWhereInput {
    const where: Prisma.ComissaoDistribuidorWhereInput = {
      distribuidorId: user.distribuidorId,
      status: StatusComissao.PENDENTE,
    };

    if (filtros.edicaoIds?.length) {
      where.venda = { edicaoId: { in: filtros.edicaoIds } };
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

  private buildDistribuidorComissaoWhereSena(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ): Prisma.ComissaoDistribuidorSenaWhereInput {
    const where: Prisma.ComissaoDistribuidorSenaWhereInput = {
      distribuidorId: user.distribuidorId,
      status: StatusComissao.PENDENTE,
    };

    if (filtros.edicaoIds?.length) {
      where.vendaSena = { edicaoSenaId: { in: filtros.edicaoIds } };
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

  private buildVendedorComissaoWhereCdp(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ): Prisma.ComissaoWhereInput {
    const where: Prisma.ComissaoWhereInput = {
      vendedorId: user.vendedorId,
      status: StatusComissao.PENDENTE,
    };

    if (filtros.edicaoIds?.length) {
      where.venda = { edicaoId: { in: filtros.edicaoIds } };
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

  private buildVendedorComissaoWhereSena(
    user: RequestUser,
    filtros: DashboardFilterDto,
  ): Prisma.ComissaoSenaWhereInput {
    const where: Prisma.ComissaoSenaWhereInput = {
      vendedorId: user.vendedorId,
      status: StatusComissao.PENDENTE,
    };

    if (filtros.edicaoIds?.length) {
      where.vendaSena = { edicaoSenaId: { in: filtros.edicaoIds } };
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

  private mapTotaisVendasEComissoes(
    vendas: Array<{ total: Prisma.Decimal }>,
    comissoes: Array<{ valor: Prisma.Decimal }>,
  ) {
    const totalVendasValor = vendas.reduce(
      (acc, venda) => acc + Number(venda.total),
      0,
    );
    const totalComissao = comissoes.reduce(
      (acc, comissao) => acc + Number(comissao.valor),
      0,
    );

    return {
      totalVendasValor: Number(totalVendasValor.toFixed(2)),
      totalComissao: Number(totalComissao.toFixed(2)),
    };
  }

  private aggregateTimeline(vendas: TimelineVenda[]) {
    const dailyMap = new Map<
      string,
      { dia: string; cartelas: number; totalR$: number }
    >();
    let totalAcumuladoR$ = 0;
    let totalCartelasAcumulado = 0;

    for (const venda of vendas) {
      const diaStr = venda.createdAt.toISOString().slice(0, 10);
      const cartelas = calcularQuantidadeCartelasDaVenda({
        quantidade: venda.quantidade,
        tipoCartela: venda.tipoCartela ?? null,
      });
      const total = Number(venda.total);

      totalAcumuladoR$ += total;
      totalCartelasAcumulado += cartelas;

      if (!dailyMap.has(diaStr)) {
        dailyMap.set(diaStr, { dia: diaStr, cartelas: 0, totalR$: 0 });
      }

      const dayData = dailyMap.get(diaStr)!;
      dayData.cartelas += cartelas;
      dayData.totalR$ += total;
    }

    const timeline = Array.from(dailyMap.values()).map((day) => ({
      dia: day.dia,
      cartelas: day.cartelas,
      totalRS: Number(day.totalR$.toFixed(2)),
    }));

    return {
      resumo: {
        totalAcumuladoRS: Number(totalAcumuladoR$.toFixed(2)),
        totalCartelasAcumulado,
      },
      timeline,
    };
  }

  private mapEdicaoFiltro(edicao: {
    id: string;
    numero: string;
    status: string;
    dataSorteio: Date;
    dataEncerramento: Date;
  }) {
    return {
      id: edicao.id,
      numero: edicao.numero,
      nome: `Edição ${String(edicao.numero).padStart(3, '0')}`,
      status: edicao.status,
      dataSorteio: edicao.dataSorteio,
      dataEncerramento: edicao.dataEncerramento,
    };
  }
}
