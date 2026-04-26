import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
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
    venda: { findMany: jest.fn() },
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
    it('should return aggregated counts for admin', async () => {
      mockPrisma.cliente.count.mockResolvedValue(100);
      mockPrisma.vendedor.count.mockResolvedValue(20);
      mockPrisma.distribuidor.count.mockResolvedValue(5);

      const res = await service.getAdminVisaoGeral();
      expect(res).toEqual({ totalClientes: 100, totalVendedores: 20, totalDistribuidores: 5 });
    });
  });

  describe('getAdminVendasPorEdicao', () => {
    it('should return mapped array with faturamento', async () => {
      mockPrisma.edicao.findMany.mockResolvedValue([
        { id: '1', numero: 1, vendas: [{ total: new Prisma.Decimal(150.50) }, { total: new Prisma.Decimal(50) }] },
        { id: '2', numero: 2, vendas: [{ total: new Prisma.Decimal(300) }] },
      ]);

      const res = await service.getAdminVendasPorEdicao();
      expect(res).toHaveLength(2);
      expect(res[0].totalFaturamento).toBe(200.5);
      expect(res[0].nome).toBe('Edição 001');
    });
  });

  // ─── TIMELINE ─────────────────────────────────────────────────────

  describe('Timeline functions (Admin, Distribuidor, Vendedor)', () => {
    const mockVendas = [
      { createdAt: new Date('2026-04-01T10:00:00Z'), quantidade: 10, total: new Prisma.Decimal(100) },
      { createdAt: new Date('2026-04-01T15:00:00Z'), quantidade: 5, total: new Prisma.Decimal(50) },
      { createdAt: new Date('2026-04-02T10:00:00Z'), quantidade: 20, total: new Prisma.Decimal(200) },
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
          where: expect.objectContaining({ distribuidorId: 'dist-1' })
        })
      );
    });

    it('Vendedor timeline filters by vendedorId', async () => {
      mockPrisma.venda.findMany.mockResolvedValue(mockVendas);
      const user = { vendedorId: 'vend-1' } as RequestUser;
      
      await service.getVendedorTimeline(user, {});
      
      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vendedorId: 'vend-1' })
        })
      );
    });
  });
});
