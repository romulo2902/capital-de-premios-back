import { Test, TestingModule } from '@nestjs/testing';
import { PagamentosService } from './pagamentos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { VendasService } from '../vendas/vendas.service';

describe('PagamentosService', () => {
  let service: PagamentosService;

  const mockGateway = {
    criarCobranca: jest.fn(),
    consultarCobranca: jest.fn(),
    cancelarCobranca: jest.fn(),
  };

  const mockPaymentGatewayFactory = {
    getGateway: jest.fn().mockReturnValue(mockGateway),
  };

  const mockVendasService = {
    confirmarPagamento: jest.fn(),
  };

  const mockPrisma = {
    venda: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagamentosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentGatewayFactory, useValue: mockPaymentGatewayFactory },
        { provide: VendasService, useValue: mockVendasService },
      ],
    }).compile();

    service = module.get<PagamentosService>(PagamentosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processarWebhookPix', () => {
    it('should return message when no pix data', async () => {
      const result = await service.processarWebhookPix({});
      expect(result.message).toContain('sem dados');
    });

    it('should process pix array and confirm payment', async () => {
      mockPrisma.venda.findFirst.mockResolvedValue({
        id: 'venda-1',
        status: 'PENDENTE',
      });
      mockVendasService.confirmarPagamento.mockResolvedValue({});

      const result = await service.processarWebhookPix({
        pix: [{ txid: 'txid-123', valor: '60.00' }],
      });

      expect(result.data!).toHaveLength(1);
      expect(result.data![0].status).toBe('CONFIRMADA');
      expect(mockVendasService.confirmarPagamento).toHaveBeenCalledWith(
        'venda-1',
        expect.any(Object),
      );
    });

    it('should skip already processed vendas', async () => {
      mockPrisma.venda.findFirst.mockResolvedValue({
        id: 'venda-1',
        status: 'APROVADO',
      });

      const result = await service.processarWebhookPix({
        pix: [{ txid: 'txid-123' }],
      });

      expect(result.data![0].status).toBe('JA_PROCESSADA');
      expect(mockVendasService.confirmarPagamento).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated data', async () => {
      mockPrisma.venda.findMany.mockResolvedValue([]);
      mockPrisma.venda.count.mockResolvedValue(0);

      const result = await service.findAll();
      expect(result.data).toBeDefined();
      expect(result.meta).toBeDefined();
    });
  });
});
