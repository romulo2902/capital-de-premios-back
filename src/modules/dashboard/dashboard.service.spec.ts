import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, TipoCartela } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../auth/strategies/jwt.strategy';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockPrisma = {
    cliente: { count: jest.fn() },
    vendedor: { count: jest.fn(), findMany: jest.fn() },
    distribuidor: { count: jest.fn() },
    edicao: { findMany: jest.fn() },
    edicaoSena: { findMany: jest.fn() },
    venda: { findMany: jest.fn() },
    vendaSena: { findMany: jest.fn() },
    comissao: { findMany: jest.fn() },
    comissaoDistribuidor: { findMany: jest.fn() },
    comissaoSena: { findMany: jest.fn() },
    comissaoDistribuidorSena: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── ADMIN ────────────────────────────────────────────────────────

  describe('getAdminVisaoGeral', () => {
    it('should return aggregated counts and top 10 vendedor ranking for admin', async () => {
      mockPrisma.cliente.count.mockResolvedValue(100);
      mockPrisma.vendedor.count.mockResolvedValue(20);
      mockPrisma.distribuidor.count.mockResolvedValue(5);
      mockPrisma.vendedor.findMany.mockResolvedValue([
        {
          id: 'vend-1',
          nome: 'Carlos',
          vendas: [
            { total: new Prisma.Decimal(300), quantidade: 2 },
            { total: new Prisma.Decimal(200), quantidade: 1 },
          ],
        },
        {
          id: 'vend-2',
          nome: 'Bianca',
          vendas: [{ total: new Prisma.Decimal(600), quantidade: 4 }],
        },
        {
          id: 'vend-3',
          nome: 'Zeca',
          vendas: [],
        },
      ]);

      const res = await service.getAdminVisaoGeral();
      expect(res.totalClientes).toBe(100);
      expect(res.totalVendedores).toBe(20);
      expect(res.totalDistribuidores).toBe(5);
      expect(res.rankingVendedores).toEqual([
        {
          vendedorId: 'vend-2',
          nome: 'Bianca',
          totalVendas: 1,
          totalCartelas: 4,
          totalVendasValor: 600,
        },
        {
          vendedorId: 'vend-1',
          nome: 'Carlos',
          totalVendas: 2,
          totalCartelas: 3,
          totalVendasValor: 500,
        },
      ]);
    });

    it('should count total cartelas using tipoCartela multiplier', async () => {
      mockPrisma.cliente.count.mockResolvedValue(1);
      mockPrisma.vendedor.count.mockResolvedValue(1);
      mockPrisma.distribuidor.count.mockResolvedValue(1);
      mockPrisma.vendedor.findMany.mockResolvedValue([
        {
          id: 'vend-1',
          nome: 'Carlos',
          vendas: [
            {
              total: new Prisma.Decimal(40),
              quantidade: 2,
              tipoCartela: TipoCartela.DUAS_CHANCES,
            },
          ],
        },
      ]);

      const res = await service.getAdminVisaoGeral();

      expect(res.rankingVendedores).toEqual([
        {
          vendedorId: 'vend-1',
          nome: 'Carlos',
          totalVendas: 1,
          totalCartelas: 4,
          totalVendasValor: 40,
        },
      ]);
    });

    it('should return Sena aggregates when tipo=SENA', async () => {
      mockPrisma.cliente.count.mockResolvedValue(33);
      mockPrisma.vendedor.count.mockResolvedValue(7);
      mockPrisma.distribuidor.count.mockResolvedValue(2);
      mockPrisma.vendedor.findMany.mockResolvedValue([
        {
          id: 'vend-sena-1',
          nome: 'Alice',
          vendasSena: [
            { total: new Prisma.Decimal(120), quantidade: 3 },
            { total: new Prisma.Decimal(80), quantidade: 2 },
          ],
        },
      ]);

      const res = await service.getAdminVisaoGeral({ tipo: 'SENA' as never });

      expect(res).toEqual({
        totalClientes: 33,
        totalVendedores: 7,
        totalDistribuidores: 2,
        rankingVendedores: [
          {
            vendedorId: 'vend-sena-1',
            nome: 'Alice',
            totalVendas: 2,
            totalCartelas: 5,
            totalVendasValor: 200,
          },
        ],
      });
      expect(mockPrisma.vendedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            vendasSena: {
              where: { status: 'APROVADO' },
              select: { total: true, quantidade: true },
            },
          }),
        }),
      );
    });
  });

  describe('getAdminVendasPorEdicao', () => {
    it('should return mapped array with faturamento', async () => {
      mockPrisma.edicao.findMany.mockResolvedValue([
        {
          id: '1',
          numero: 1,
          vendas: [
            { total: new Prisma.Decimal(150.5) },
            { total: new Prisma.Decimal(50) },
          ],
        },
        { id: '2', numero: 2, vendas: [{ total: new Prisma.Decimal(300) }] },
      ]);

      const res = await service.getAdminVendasPorEdicao();
      expect(res).toHaveLength(2);
      expect(res[0].totalFaturamento).toBe(200.5);
      expect(res[0].nome).toBe('Edição 001');
    });

    it('should return Sena faturamento when tipo=SENA', async () => {
      mockPrisma.edicaoSena.findMany.mockResolvedValue([
        {
          id: 's1',
          numero: '9',
          vendas: [
            { total: new Prisma.Decimal(90) },
            { total: new Prisma.Decimal(10) },
          ],
        },
      ]);

      const res = await service.getAdminVendasPorEdicao({ tipo: 'SENA' as never });

      expect(res).toEqual([
        {
          id: 's1',
          nome: 'Edição 009',
          totalFaturamento: 100,
        },
      ]);
    });
  });

  describe('getEdicoesDisponiveis', () => {
    it('should return minimal edicao contract for distribuidor', async () => {
      mockPrisma.edicao.findMany.mockResolvedValue([
        {
          id: 'ed-1',
          numero: '1',
          status: 'ATIVA',
          dataSorteio: new Date('2026-05-10T00:00:00Z'),
          dataEncerramento: new Date('2026-05-09T00:00:00Z'),
        },
      ]);

      const res = await service.getEdicoesDisponiveis({
        perfil: 'DISTRIBUIDOR',
        distribuidorId: 'dist-1',
      } as RequestUser);

      expect(res).toEqual([
        {
          id: 'ed-1',
          numero: '1',
          nome: 'Edição 001',
          status: 'ATIVA',
          dataSorteio: new Date('2026-05-10T00:00:00Z'),
          dataEncerramento: new Date('2026-05-09T00:00:00Z'),
        },
      ]);
    });

    it('should return minimal edicao contract for vendedor', async () => {
      mockPrisma.edicao.findMany.mockResolvedValue([
        {
          id: 'ed-2',
          numero: '12',
          status: 'ENCERRADA',
          dataSorteio: new Date('2026-04-20T00:00:00Z'),
          dataEncerramento: new Date('2026-04-19T00:00:00Z'),
        },
      ]);

      const res = await service.getEdicoesDisponiveis({
        perfil: 'VENDEDOR',
        vendedorId: 'vend-1',
      } as RequestUser);

      expect(res).toEqual([
        {
          id: 'ed-2',
          numero: '12',
          nome: 'Edição 012',
          status: 'ENCERRADA',
          dataSorteio: new Date('2026-04-20T00:00:00Z'),
          dataEncerramento: new Date('2026-04-19T00:00:00Z'),
        },
      ]);
    });
  });

  // ─── TIMELINE ─────────────────────────────────────────────────────

  describe('Timeline functions (Admin, Distribuidor, Vendedor)', () => {
    const mockVendas = [
      {
        createdAt: new Date('2026-04-01T10:00:00Z'),
        quantidade: 10,
        total: new Prisma.Decimal(100),
      },
      {
        createdAt: new Date('2026-04-01T15:00:00Z'),
        quantidade: 5,
        total: new Prisma.Decimal(50),
      },
      {
        createdAt: new Date('2026-04-02T10:00:00Z'),
        quantidade: 20,
        total: new Prisma.Decimal(200),
      },
    ];

    it('Admin timeline groups by day correctly', async () => {
      mockPrisma.venda.findMany.mockResolvedValue(mockVendas);
      const res = await service.getAdminAnaliseTimeline({});

      expect(res.timeline).toHaveLength(2); // Apr 1 and Apr 2
      expect(res.timeline[0].dia).toBe('2026-04-01');
      expect(res.timeline[0].cartelas).toBe(15);
      expect(res.timeline[0].totalRS).toBe(150);

      expect(res.resumo.totalAcumuladoRS).toBe(350);
    });

    it('Admin timeline uses vendaSena when tipo=SENA', async () => {
      mockPrisma.vendaSena.findMany.mockResolvedValue(mockVendas);

      const res = await service.getAdminAnaliseTimeline({ tipo: 'SENA' as never });

      expect(mockPrisma.vendaSena.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'APROVADO' },
        }),
      );
      expect(res.resumo.totalCartelasAcumulado).toBe(35);
    });

    it('Admin timeline should ignore dataInicio/dataFim and filter only by edicaoIds', async () => {
      mockPrisma.venda.findMany.mockResolvedValue(mockVendas);

      await service.getAdminAnaliseTimeline({
        edicaoIds: ['edicao-123'],
        dataInicio: '2026-01-01',
        dataFim: '2026-12-31',
      });

      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'APROVADO',
            edicaoId: { in: ['edicao-123'] },
          },
        }),
      );
    });

    it('Distribuidor timeline filters by distribuidorId', async () => {
      mockPrisma.venda.findMany.mockResolvedValue(mockVendas);
      const user = { distribuidorId: 'dist-1' } as RequestUser;

      await service.getDistribuidorTimeline(user, {});

      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ distribuidorId: 'dist-1' }),
        }),
      );
    });

    it('Distribuidor comissoes returns total de vendas e total de comissao com filtro', async () => {
      mockPrisma.venda.findMany.mockResolvedValue([
        { total: new Prisma.Decimal(150) },
        { total: new Prisma.Decimal(50) },
      ]);
      mockPrisma.comissaoDistribuidor.findMany.mockResolvedValue([
        { valor: new Prisma.Decimal(12) },
        { valor: new Prisma.Decimal(8) },
      ]);
      const user = { distribuidorId: 'dist-1' } as RequestUser;

      const res = await service.getDistribuidorComissoes(user, {
        edicaoIds: ['edicao-1'],
      });

      expect(res).toEqual({
        totalVendasValor: 200,
        totalComissao: 20,
      });
      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith({
        where: {
          status: 'APROVADO',
          distribuidorId: 'dist-1',
          edicaoId: { in: ['edicao-1'] },
        },
        select: { total: true },
      });
      expect(mockPrisma.comissaoDistribuidor.findMany).toHaveBeenCalledWith({
        where: {
          distribuidorId: 'dist-1',
          status: 'PENDENTE',
          venda: { edicaoId: { in: ['edicao-1'] } },
        },
        select: { valor: true },
      });
    });

    it('Distribuidor comissoes switches to Sena collections when tipo=SENA', async () => {
      mockPrisma.vendaSena.findMany.mockResolvedValue([
        { total: new Prisma.Decimal(40) },
        { total: new Prisma.Decimal(60) },
      ]);
      mockPrisma.comissaoDistribuidorSena.findMany.mockResolvedValue([
        { valor: new Prisma.Decimal(11) },
      ]);
      const user = { distribuidorId: 'dist-1' } as RequestUser;

      const res = await service.getDistribuidorComissoes(user, {
        tipo: 'SENA' as never,
        edicaoIds: ['sena-1'],
      });

      expect(res).toEqual({
        totalVendasValor: 100,
        totalComissao: 11,
      });
      expect(mockPrisma.comissaoDistribuidorSena.findMany).toHaveBeenCalledWith({
        where: {
          distribuidorId: 'dist-1',
          status: 'PENDENTE',
          vendaSena: { edicaoSenaId: { in: ['sena-1'] } },
        },
        select: { valor: true },
      });
    });

    it('Distribuidor vendas por vendedor applies edicao filter when provided', async () => {
      mockPrisma.vendedor.findMany.mockResolvedValue([
        {
          id: 'vend-1',
          nome: 'Carlos',
          vendas: [{ total: new Prisma.Decimal(80), quantidade: 2 }],
        },
      ]);
      const user = { distribuidorId: 'dist-1' } as RequestUser;

      const res = await service.getDistribuidorVendasPorVendedor(user, {
        edicaoIds: ['edicao-1'],
      });

      expect(res).toEqual([
        {
          vendedorId: 'vend-1',
          nome: 'Carlos',
          quantidadeVendas: 2,
          totalFaturamento: 80,
        },
      ]);
      expect(mockPrisma.vendedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { distribuidorId: 'dist-1' },
          select: expect.objectContaining({
            vendas: {
              where: {
                status: 'APROVADO',
                edicaoId: { in: ['edicao-1'] },
              },
              select: { total: true, quantidade: true, tipoCartela: true },
            },
          }),
        }),
      );
    });

    it('Distribuidor clientes por vendedor keeps assigned-count when no filter is provided', async () => {
      mockPrisma.vendedor.findMany.mockResolvedValue([
        {
          id: 'vend-1',
          nome: 'Carlos',
          _count: { clientes: 4 },
        },
      ]);
      const user = { distribuidorId: 'dist-1' } as RequestUser;

      const res = await service.getDistribuidorClientesPorVendedor(user, {});

      expect(res).toEqual([
        {
          vendedorId: 'vend-1',
          nome: 'Carlos',
          totalClientes: 4,
        },
      ]);
      expect(mockPrisma.vendedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nome: true,
            _count: { select: { clientes: true } },
          },
        }),
      );
    });

    it('Distribuidor clientes por vendedor counts unique buyers in filtered period/edition', async () => {
      mockPrisma.vendedor.findMany.mockResolvedValue([
        {
          id: 'vend-1',
          nome: 'Carlos',
          vendas: [
            { clienteId: 'cliente-1' },
            { clienteId: 'cliente-1' },
            { clienteId: 'cliente-2' },
          ],
        },
      ]);
      const user = { distribuidorId: 'dist-1' } as RequestUser;

      const res = await service.getDistribuidorClientesPorVendedor(user, {
        edicaoIds: ['edicao-1'],
      });

      expect(res).toEqual([
        {
          vendedorId: 'vend-1',
          nome: 'Carlos',
          totalClientes: 2,
        },
      ]);
      expect(mockPrisma.vendedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            nome: true,
            vendas: {
              where: {
                status: 'APROVADO',
                edicaoId: { in: ['edicao-1'] },
              },
              select: { clienteId: true },
            },
          },
        }),
      );
    });

    it('Vendedor timeline filters by vendedorId', async () => {
      mockPrisma.venda.findMany.mockResolvedValue(mockVendas);
      const user = { vendedorId: 'vend-1' } as RequestUser;

      await service.getVendedorTimeline(user, {});

      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vendedorId: 'vend-1' }),
        }),
      );
    });

    it('Vendedor total clientes keeps full count when no filter is provided', async () => {
      mockPrisma.cliente.count.mockResolvedValue(5);
      mockPrisma.venda.findMany.mockResolvedValue([
        { total: new Prisma.Decimal(100) },
      ]);
      mockPrisma.comissao.findMany.mockResolvedValue([
        { valor: new Prisma.Decimal(15) },
      ]);
      const user = { vendedorId: 'vend-1' } as RequestUser;

      const res = await service.getVendedorTotalClientes(user, {});

      expect(res).toEqual({
        totalClientes: 5,
        totalVendasValor: 100,
        totalComissao: 15,
      });
      expect(mockPrisma.cliente.count).toHaveBeenCalledWith({
        where: { vendedorId: 'vend-1' },
      });
    });

    it('Vendedor comissoes returns total de vendas e total de comissao com filtro', async () => {
      mockPrisma.venda.findMany.mockResolvedValue([
        { total: new Prisma.Decimal(70) },
        { total: new Prisma.Decimal(30) },
      ]);
      mockPrisma.comissao.findMany.mockResolvedValue([
        { valor: new Prisma.Decimal(6) },
        { valor: new Prisma.Decimal(4) },
      ]);
      const user = { vendedorId: 'vend-1' } as RequestUser;

      const res = await service.getVendedorComissoes(user, {
        edicaoIds: ['edicao-1'],
      });

      expect(res).toEqual({
        totalVendasValor: 100,
        totalComissao: 10,
      });
      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith({
        where: {
          status: 'APROVADO',
          vendedorId: 'vend-1',
          edicaoId: { in: ['edicao-1'] },
        },
        select: { total: true },
      });
      expect(mockPrisma.comissao.findMany).toHaveBeenCalledWith({
        where: {
          vendedorId: 'vend-1',
          status: 'PENDENTE',
          venda: { edicaoId: { in: ['edicao-1'] } },
        },
        select: { valor: true },
      });
    });

    it('Vendedor total clientes filters by edicaoIds when provided', async () => {
      mockPrisma.cliente.count.mockResolvedValue(2);
      mockPrisma.venda.findMany.mockResolvedValue([
        { total: new Prisma.Decimal(80) },
        { total: new Prisma.Decimal(20) },
      ]);
      mockPrisma.comissao.findMany.mockResolvedValue([
        { valor: new Prisma.Decimal(10) },
      ]);
      const user = { vendedorId: 'vend-1' } as RequestUser;

      const res = await service.getVendedorTotalClientes(user, {
        edicaoIds: ['edicao-1'],
      });

      expect(res).toEqual({
        totalClientes: 2,
        totalVendasValor: 100,
        totalComissao: 10,
      });
      expect(mockPrisma.cliente.count).toHaveBeenCalledWith({
        where: {
          vendedorId: 'vend-1',
          vendas: {
            some: {
              status: 'APROVADO',
              vendedorId: 'vend-1',
              edicaoId: { in: ['edicao-1'] },
            },
          },
        },
      });
      expect(mockPrisma.comissao.findMany).toHaveBeenCalledWith({
        where: {
          vendedorId: 'vend-1',
          status: 'PENDENTE',
          venda: { edicaoId: { in: ['edicao-1'] } },
        },
        select: { valor: true },
      });
    });

    it('Vendedor comissoes switches to Sena collections when tipo=SENA', async () => {
      mockPrisma.vendaSena.findMany.mockResolvedValue([
        { total: new Prisma.Decimal(25) },
        { total: new Prisma.Decimal(75) },
      ]);
      mockPrisma.comissaoSena.findMany.mockResolvedValue([
        { valor: new Prisma.Decimal(9) },
      ]);
      const user = { vendedorId: 'vend-1' } as RequestUser;

      const res = await service.getVendedorComissoes(user, {
        tipo: 'SENA' as never,
        edicaoIds: ['sena-1'],
      });

      expect(res).toEqual({
        totalVendasValor: 100,
        totalComissao: 9,
      });
      expect(mockPrisma.comissaoSena.findMany).toHaveBeenCalledWith({
        where: {
          vendedorId: 'vend-1',
          status: 'PENDENTE',
          vendaSena: { edicaoSenaId: { in: ['sena-1'] } },
        },
        select: { valor: true },
      });
    });
  });
});
