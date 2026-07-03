import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { PagamentosService } from './pagamentos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { MercadoPagoPixGateway } from './gateways/mercadopago-pix.gateway';
import { VendasService } from '../vendas/vendas.service';
import { VendasSenaService } from '../capital-sena/vendas-sena/vendas-sena.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import { EmailService } from '../../common/email/email.service';
import { ConfigService } from '@nestjs/config';

describe('PagamentosService', () => {
  let service: PagamentosService;

  const mockGateway = {
    criarCobranca: jest.fn(),
    consultarCobranca: jest.fn(),
    cancelarCobranca: jest.fn(),
  };

  const mockPaymentGatewayFactory = {
    getGateway: jest.fn().mockReturnValue(mockGateway),
    getGatewayParaConsulta: jest.fn().mockReturnValue(mockGateway),
  };

  const mockMercadoPagoPixGateway = {
    criarCobranca: jest.fn(),
    consultarCobranca: jest.fn(),
    cancelarCobranca: jest.fn(),
  };

  const mockVendasService = {
    confirmarPagamento: jest.fn(),
  };

  const mockVendasSenaService = {
    confirmarPagamento: jest.fn(),
  };

  const mockEmailService = {
    enviarCompraAprovada: jest.fn(),
    enviarCompraAprovadaSena: jest.fn(),
  };

  const mockPrisma = {
    venda: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    vendaSena: {
      findFirst: jest.fn(),
    },
  };

  const mockDistributedLockService = {
    acquire: jest.fn().mockResolvedValue({
      key: 'lock:pix:webhook:txid-123',
      token: 'token-123',
    }),
    release: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PagamentosService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
        { provide: PaymentGatewayFactory, useValue: mockPaymentGatewayFactory },
        { provide: MercadoPagoPixGateway, useValue: mockMercadoPagoPixGateway },
        { provide: VendasService, useValue: mockVendasService },
        { provide: VendasSenaService, useValue: mockVendasSenaService },
        {
          provide: DistributedLockService,
          useValue: mockDistributedLockService,
        },
        { provide: EmailService, useValue: mockEmailService },
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

    it('should find PIX order by charge metadata when reference_id is absent', async () => {
      mockPrisma.venda.findFirst.mockResolvedValue({
        id: 'venda-1',
        status: 'PENDENTE',
      });
      mockVendasService.confirmarPagamento.mockResolvedValue({});

      const result = await service.processarWebhookPix({
        event: 'CHARGE.PAID',
        charges: [
          {
            id: 'CHAR_123',
            status: 'PAID',
            metadata: { ps_order_id: 'ORDE_123' },
          },
        ],
      });

      expect(result.data![0].status).toBe('CONFIRMADA');
      expect(mockPrisma.venda.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { gatewayId: { in: ['CHAR_123', 'ORDE_123', 'CHAR_123'] } },
            ]),
          }),
        }),
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

    it('should process order payload resolved from legacy notification xml', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/xml'),
        },
        text: jest
          .fn()
          .mockResolvedValue(
            '<transaction><code>ORDE_123</code><reference>venda-1</reference><status>3</status></transaction>',
          ),
      } as unknown as Response);

      const configGet = jest.fn((key: string) => {
        if (key === 'PAGBANK_NOTIFICATION_EMAIL') return 'test@example.com';
        if (key === 'PAGBANK_NOTIFICATION_TOKEN') return 'token-123';
        return '';
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PagamentosService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: { get: configGet } },
          {
            provide: PaymentGatewayFactory,
            useValue: mockPaymentGatewayFactory,
          },
          { provide: MercadoPagoPixGateway, useValue: mockMercadoPagoPixGateway },
          { provide: VendasService, useValue: mockVendasService },
          { provide: VendasSenaService, useValue: mockVendasSenaService },
          {
            provide: DistributedLockService,
            useValue: mockDistributedLockService,
          },
          { provide: EmailService, useValue: mockEmailService },
        ],
      }).compile();

      service = module.get<PagamentosService>(PagamentosService);
      mockPrisma.venda.findFirst.mockResolvedValue({
        id: 'venda-1',
        status: 'PENDENTE',
      });
      mockVendasService.confirmarPagamento.mockResolvedValue({});

      const result = await service.processarWebhookPix({
        notificationCode: 'abc',
        notificationType: 'transaction',
      });

      expect(result.data![0].status).toBe('CONFIRMADA');
      expect(fetchMock).toHaveBeenCalled();
      fetchMock.mockRestore();
    });
  });

  describe('processarWebhookMercadoPago', () => {
    it('should return message when payment id is missing', async () => {
      const result = await service.processarWebhookMercadoPago({}, {}, {});
      expect(result.message).toContain('sem dados');
    });

    it('should ignore payment that is not yet approved', async () => {
      mockMercadoPagoPixGateway.consultarCobranca.mockResolvedValue({
        status: 'PENDENTE',
        payload: {},
      });

      const result = await service.processarWebhookMercadoPago(
        {},
        {},
        { data: { id: '123456' } },
      );

      expect(result.data).toEqual({
        gatewayId: '123456',
        status: 'IGNORADO_PENDENTE',
      });
      expect(mockVendasService.confirmarPagamento).not.toHaveBeenCalled();
    });

    it('should confirm payment when payment is approved and venda is pending', async () => {
      mockMercadoPagoPixGateway.consultarCobranca.mockResolvedValue({
        status: 'APROVADO',
        payload: { id: '123456' },
      });
      mockPrisma.venda.findFirst.mockResolvedValue({
        id: 'venda-1',
        status: 'PENDENTE',
      });
      mockVendasService.confirmarPagamento.mockResolvedValue({});

      const result = await service.processarWebhookMercadoPago(
        {},
        {},
        { data: { id: '123456' } },
      );

      expect(result.data).toEqual({ gatewayId: '123456', status: 'CONFIRMADA' });
      expect(mockVendasService.confirmarPagamento).toHaveBeenCalledWith(
        'venda-1',
        expect.any(Object),
      );
    });

    it('should prefer data.id from the query string over the body', async () => {
      mockMercadoPagoPixGateway.consultarCobranca.mockResolvedValue({
        status: 'PENDENTE',
        payload: {},
      });

      const result = await service.processarWebhookMercadoPago(
        {},
        { 'data.id': 'id-da-query' },
        { data: { id: 'id-do-body' } },
      );

      expect(mockMercadoPagoPixGateway.consultarCobranca).toHaveBeenCalledWith(
        'id-da-query',
      );
      expect(result.data).toEqual({
        gatewayId: 'id-da-query',
        status: 'IGNORADO_PENDENTE',
      });
    });

    it('should reject webhook with invalid signature when secret is configured', async () => {
      const configGet = jest.fn((key: string) => {
        if (key === 'MERCADOPAGO_WEBHOOK_SECRET') return 'meu-segredo';
        return '';
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PagamentosService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: { get: configGet } },
          {
            provide: PaymentGatewayFactory,
            useValue: mockPaymentGatewayFactory,
          },
          { provide: MercadoPagoPixGateway, useValue: mockMercadoPagoPixGateway },
          { provide: VendasService, useValue: mockVendasService },
          { provide: VendasSenaService, useValue: mockVendasSenaService },
          {
            provide: DistributedLockService,
            useValue: mockDistributedLockService,
          },
          { provide: EmailService, useValue: mockEmailService },
        ],
      }).compile();

      const serviceComSecret = module.get<PagamentosService>(PagamentosService);

      await expect(
        serviceComSecret.processarWebhookMercadoPago(
          { 'x-signature': 'ts=123,v1=assinatura-invalida', 'x-request-id': 'req-1' },
          {},
          { data: { id: '123456' } },
        ),
      ).rejects.toThrow('Assinatura do webhook inválida');
    });

    it('should accept webhook with a valid signature', async () => {
      const secret = 'meu-segredo';
      const configGet = jest.fn((key: string) => {
        if (key === 'MERCADOPAGO_WEBHOOK_SECRET') return secret;
        return '';
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PagamentosService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: ConfigService, useValue: { get: configGet } },
          {
            provide: PaymentGatewayFactory,
            useValue: mockPaymentGatewayFactory,
          },
          { provide: MercadoPagoPixGateway, useValue: mockMercadoPagoPixGateway },
          { provide: VendasService, useValue: mockVendasService },
          { provide: VendasSenaService, useValue: mockVendasSenaService },
          {
            provide: DistributedLockService,
            useValue: mockDistributedLockService,
          },
          { provide: EmailService, useValue: mockEmailService },
        ],
      }).compile();

      const serviceComSecret = module.get<PagamentosService>(PagamentosService);

      mockMercadoPagoPixGateway.consultarCobranca.mockResolvedValue({
        status: 'PENDENTE',
        payload: {},
      });

      const ts = '1700000000000';
      const requestId = 'req-1';
      const manifest = `id:123456;request-id:${requestId};ts:${ts};`;
      const v1 = createHmac('sha256', secret).update(manifest).digest('hex');

      const result = await serviceComSecret.processarWebhookMercadoPago(
        { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
        {},
        { data: { id: '123456' } },
      );

      expect(result.data).toEqual({
        gatewayId: '123456',
        status: 'IGNORADO_PENDENTE',
      });
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
