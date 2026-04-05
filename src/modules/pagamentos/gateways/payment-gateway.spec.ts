import { Test, TestingModule } from '@nestjs/testing';
import { TipoPagamento } from '@prisma/client';
import { NotImplementedException } from '@nestjs/common';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { InterPixGateway } from './inter-pix.gateway';
import { CartaoCreditGateway } from './cartao-credit.gateway';
import { ConfigService } from '@nestjs/config';

describe('PaymentGateway', () => {
  // ─── PaymentGatewayFactory ────────────────────────────

  describe('PaymentGatewayFactory', () => {
    let factory: PaymentGatewayFactory;
    let interPixGateway: InterPixGateway;
    let cartaoCreditGateway: CartaoCreditGateway;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentGatewayFactory,
          {
            provide: InterPixGateway,
            useValue: {
              criarCobranca: jest.fn(),
              consultarCobranca: jest.fn(),
              cancelarCobranca: jest.fn(),
            },
          },
          {
            provide: CartaoCreditGateway,
            useValue: {
              criarCobranca: jest.fn(),
              consultarCobranca: jest.fn(),
              cancelarCobranca: jest.fn(),
            },
          },
        ],
      }).compile();

      factory = module.get<PaymentGatewayFactory>(PaymentGatewayFactory);
      interPixGateway = module.get<InterPixGateway>(InterPixGateway);
      cartaoCreditGateway = module.get<CartaoCreditGateway>(CartaoCreditGateway);
    });

    it('should be defined', () => {
      expect(factory).toBeDefined();
    });

    it('should return InterPixGateway for TipoPagamento.PIX', () => {
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(interPixGateway);
    });

    it('should return CartaoCreditGateway for TipoPagamento.CARTAO', () => {
      const gateway = factory.getGateway(TipoPagamento.CARTAO);
      expect(gateway).toBe(cartaoCreditGateway);
    });
  });

  // ─── CartaoCreditGateway (stub) ───────────────────────

  describe('CartaoCreditGateway', () => {
    let gateway: CartaoCreditGateway;

    beforeEach(() => {
      gateway = new CartaoCreditGateway();
    });

    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('criarCobranca should throw NotImplementedException', async () => {
      await expect(
        gateway.criarCobranca({
          vendaId: 'venda-1',
          valorCentavos: 6000,
          descricao: 'Teste',
          cpfPagador: '12345678900',
          nomePagador: 'Teste',
        }),
      ).rejects.toThrow(NotImplementedException);
    });

    it('consultarCobranca should throw NotImplementedException', async () => {
      await expect(
        gateway.consultarCobranca('gateway-id'),
      ).rejects.toThrow(NotImplementedException);
    });

    it('cancelarCobranca should throw NotImplementedException', async () => {
      await expect(
        gateway.cancelarCobranca('gateway-id'),
      ).rejects.toThrow(NotImplementedException);
    });
  });

  // ─── InterPixGateway ──────────────────────────────────

  describe('InterPixGateway', () => {
    let gateway: InterPixGateway;

    beforeEach(async () => {
      const mockConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
          const config: Record<string, string> = {
            INTER_API_URL: 'https://test.inter.co',
            INTER_CLIENT_ID: 'test-client-id',
            INTER_CLIENT_SECRET: 'test-client-secret',
            INTER_CERT_PATH: '/tmp/test-cert.crt',
            INTER_KEY_PATH: '/tmp/test-key.key',
            INTER_PIX_KEY: 'test-pix-key',
          };
          return config[key] ?? defaultValue ?? '';
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InterPixGateway,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      gateway = module.get<InterPixGateway>(InterPixGateway);
    });

    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('should have criarCobranca method', () => {
      expect(typeof gateway.criarCobranca).toBe('function');
    });

    it('should have consultarCobranca method', () => {
      expect(typeof gateway.consultarCobranca).toBe('function');
    });

    it('should have cancelarCobranca method', () => {
      expect(typeof gateway.cancelarCobranca).toBe('function');
    });
  });
});
