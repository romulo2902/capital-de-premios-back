import { Test, TestingModule } from '@nestjs/testing';
import { TipoPagamento } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { PagBankPixGateway } from './pagbank-pix.gateway';
import { PagBankCartaoGateway } from './pagbank-cartao.gateway';
import { MockPixGateway } from './mock-pix.gateway';
import { ConfigService } from '@nestjs/config';

describe('PaymentGateway', () => {
  // ─── PaymentGatewayFactory ────────────────────────────

  describe('PaymentGatewayFactory', () => {
    let factory: PaymentGatewayFactory;
    let pagBankPixGateway: PagBankPixGateway;
    let pagBankCartaoGateway: PagBankCartaoGateway;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentGatewayFactory,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string) => {
                const config: Record<string, string> = {
                  MOCK_PIX_AUTO_APPROVE: 'false',
                };
                return config[key];
              }),
            },
          },
          {
            provide: PagBankPixGateway,
            useValue: {
              criarCobranca: jest.fn(),
              consultarCobranca: jest.fn(),
              cancelarCobranca: jest.fn(),
            },
          },
          {
            provide: MockPixGateway,
            useValue: {
              criarCobranca: jest.fn(),
              consultarCobranca: jest.fn(),
              cancelarCobranca: jest.fn(),
            },
          },
          {
            provide: PagBankCartaoGateway,
            useValue: {
              criarCobranca: jest.fn(),
              consultarCobranca: jest.fn(),
              cancelarCobranca: jest.fn(),
            },
          },
        ],
      }).compile();

      factory = module.get<PaymentGatewayFactory>(PaymentGatewayFactory);
      pagBankPixGateway = module.get<PagBankPixGateway>(PagBankPixGateway);
      pagBankCartaoGateway =
        module.get<PagBankCartaoGateway>(PagBankCartaoGateway);
    });

    it('should be defined', () => {
      expect(factory).toBeDefined();
    });

    it('should return PagBankPixGateway for TipoPagamento.PIX', () => {
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(pagBankPixGateway);
    });

    it('should return PagBankCartaoGateway for TipoPagamento.CARTAO', () => {
      const gateway = factory.getGateway(TipoPagamento.CARTAO);
      expect(gateway).toBe(pagBankCartaoGateway);
    });

    it('should throw for TipoPagamento.MANUAL', () => {
      expect(() => factory.getGateway(TipoPagamento.MANUAL)).toThrow(
        'TipoPagamento.MANUAL não utiliza gateway de pagamento',
      );
    });
  });

  // ─── PagBankCartaoGateway — validação cardToken ───────

  describe('PagBankCartaoGateway', () => {
    let gateway: PagBankCartaoGateway;

    beforeEach(async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) => {
            const config: Record<string, string> = {
              PAGBANK_API_URL: 'https://sandbox.api.pagseguro.com',
              PAGBANK_CLIENT_ID: 'test-client-id',
              PAGBANK_CLIENT_SECRET: 'test-client-secret',
            };
            return config[key] ?? defaultValue ?? '';
          }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PagBankCartaoGateway,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      gateway = module.get<PagBankCartaoGateway>(PagBankCartaoGateway);
    });

    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('criarCobranca should throw BadRequestException when cardToken is missing', async () => {
      await expect(
        gateway.criarCobranca({
          vendaId: 'venda-uuid-1',
          valorCentavos: 6000,
          descricao: 'Teste cartão',
          cpfPagador: '12345678900',
          nomePagador: 'João Teste',
          // cardToken ausente propositalmente
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should have consultarCobranca method', () => {
      expect(typeof gateway.consultarCobranca).toBe('function');
    });

    it('should have cancelarCobranca method', () => {
      expect(typeof gateway.cancelarCobranca).toBe('function');
    });
  });

  // ─── PagBankPixGateway ────────────────────────────────

  describe('PagBankPixGateway', () => {
    let gateway: PagBankPixGateway;

    beforeEach(async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) => {
            const config: Record<string, string> = {
              PAGBANK_API_URL: 'https://sandbox.api.pagseguro.com',
              PAGBANK_CLIENT_ID: 'test-client-id',
              PAGBANK_CLIENT_SECRET: 'test-client-secret',
              PAGBANK_PIX_KEY: 'test@pix.key',
            };
            return config[key] ?? defaultValue ?? '';
          }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PagBankPixGateway,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      gateway = module.get<PagBankPixGateway>(PagBankPixGateway);
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
