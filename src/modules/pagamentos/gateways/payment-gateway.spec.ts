import { Test, TestingModule } from '@nestjs/testing';
import { TipoPagamento } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { PagBankPixGateway } from './pagbank-pix.gateway';
import { PagBankCartaoGateway } from './pagbank-cartao.gateway';
import { MercadoPagoPixGateway } from './mercadopago-pix.gateway';
import { MockPixGateway } from './mock-pix.gateway';
import { ConfigService } from '@nestjs/config';

describe('PaymentGateway', () => {
  // ─── PaymentGatewayFactory ────────────────────────────

  describe('PaymentGatewayFactory', () => {
    let factory: PaymentGatewayFactory;
    let pagBankPixGateway: PagBankPixGateway;
    let pagBankCartaoGateway: PagBankCartaoGateway;
    let mercadoPagoPixGateway: MercadoPagoPixGateway;
    let configValues: Record<string, string>;

    beforeEach(async () => {
      configValues = {
        MOCK_PIX_AUTO_APPROVE: 'false',
        PIX_GATEWAY_PROVIDER: 'PAGBANK',
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaymentGatewayFactory,
          {
            provide: ConfigService,
            useValue: {
              get: jest
                .fn()
                .mockImplementation(
                  (key: string, defaultValue?: string) =>
                    configValues[key] ?? defaultValue,
                ),
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
            provide: MercadoPagoPixGateway,
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
      mercadoPagoPixGateway = module.get<MercadoPagoPixGateway>(
        MercadoPagoPixGateway,
      );
    });

    it('should be defined', () => {
      expect(factory).toBeDefined();
    });

    it('should return PagBankPixGateway for TipoPagamento.PIX by default', () => {
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(pagBankPixGateway);
    });

    it('should return MercadoPagoPixGateway when PIX_GATEWAY_PROVIDER=MERCADOPAGO', () => {
      configValues.PIX_GATEWAY_PROVIDER = 'MERCADOPAGO';
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(mercadoPagoPixGateway);
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

    describe('getGatewayParaConsulta', () => {
      it('should return PagBankPixGateway when gatewayPayload has no mercadoPagoResponse', () => {
        const gateway = factory.getGatewayParaConsulta(TipoPagamento.PIX, {
          pagbankResponse: { id: 'ORDE_123' },
        });
        expect(gateway).toBe(pagBankPixGateway);
      });

      it('should return MercadoPagoPixGateway when gatewayPayload has mercadoPagoResponse, regardless of current PIX_GATEWAY_PROVIDER', () => {
        configValues.PIX_GATEWAY_PROVIDER = 'PAGBANK';
        const gateway = factory.getGatewayParaConsulta(TipoPagamento.PIX, {
          mercadoPagoResponse: { id: 'ORD01...' },
        });
        expect(gateway).toBe(mercadoPagoPixGateway);
      });

      it('should fall back to current provider when gatewayPayload is undefined', () => {
        const gateway = factory.getGatewayParaConsulta(TipoPagamento.PIX);
        expect(gateway).toBe(pagBankPixGateway);
      });
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

  // ─── MercadoPagoPixGateway ─────────────────────────────

  describe('MercadoPagoPixGateway', () => {
    let gateway: MercadoPagoPixGateway;

    beforeEach(async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) => {
            const config: Record<string, string> = {
              MERCADOPAGO_API_URL: 'https://api.mercadopago.com',
              MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
            };
            return config[key] ?? defaultValue ?? '';
          }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MercadoPagoPixGateway,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      gateway = module.get<MercadoPagoPixGateway>(MercadoPagoPixGateway);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('should create a PIX order and return the QR code data', async () => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'ORD01HRYFWNYRE1MR1E60MW3X0T2P',
            status: 'action_required',
            transactions: {
              payments: [
                {
                  id: 'PAY01HRYFXQ53Q3JPEC48MYWMR0TE',
                  status: 'action_required',
                  payment_method: {
                    id: 'pix',
                    type: 'bank_transfer',
                    qr_code: '00020126580014br.gov.bcb.pix...',
                    qr_code_base64: 'aGVsbG8=',
                    ticket_url: 'https://www.mercadopago.com.br/sandbox/...',
                  },
                },
              ],
            },
          }),
        ),
      } as unknown as Response);

      const resultado = await gateway.criarCobranca({
        vendaId: 'venda-uuid-1',
        valorCentavos: 6000,
        descricao: 'Teste PIX Mercado Pago',
        cpfPagador: '123.456.789-00',
        nomePagador: 'João Teste',
        emailPagador: 'joao@teste.com',
      });

      expect(resultado.gatewayId).toBe('ORD01HRYFWNYRE1MR1E60MW3X0T2P');
      expect(resultado.pixCopiaECola).toBe('00020126580014br.gov.bcb.pix...');
      expect(resultado.qrCodeBase64).toBe('aGVsbG8=');

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options!.body as string);
      expect(body.total_amount).toBe('60.00');
      expect(body.payer.identification.number).toBe('12345678900');
    });

    it('should map order status processed to APROVADO', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'ORD01',
            status: 'processed',
            transactions: {
              payments: [{ id: 'PAY01', date_approved: '2026-01-01T10:00:00Z' }],
            },
          }),
        ),
      } as unknown as Response);

      const resultado = await gateway.consultarCobranca('ORD01');

      expect(resultado.status).toBe('APROVADO');
      expect(resultado.paidAt).toEqual(new Date('2026-01-01T10:00:00Z'));
    });

    it('should override payer email with MERCADOPAGO_SANDBOX_PAYER_EMAIL when configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MercadoPagoPixGateway,
          {
            provide: ConfigService,
            useValue: {
              get: jest
                .fn()
                .mockImplementation(
                  (key: string, defaultValue?: string) =>
                    ({
                      MERCADOPAGO_API_URL: 'https://api.mercadopago.com',
                      MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
                      MERCADOPAGO_SANDBOX_PAYER_EMAIL: 'test_user_123@testuser.com',
                    })[key] ?? defaultValue ?? '',
                ),
            },
          },
        ],
      }).compile();

      const gatewaySandbox =
        module.get<MercadoPagoPixGateway>(MercadoPagoPixGateway);

      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            id: 'ORD01',
            status: 'action_required',
            transactions: {
              payments: [
                {
                  id: 'PAY01',
                  payment_method: { id: 'pix', type: 'bank_transfer', qr_code: 'abc' },
                },
              ],
            },
          }),
        ),
      } as unknown as Response);

      await gatewaySandbox.criarCobranca({
        vendaId: 'venda-uuid-1',
        valorCentavos: 6000,
        descricao: 'Teste PIX Mercado Pago',
        cpfPagador: '12345678900',
        nomePagador: 'João Teste',
        emailPagador: 'cliente.real@gmail.com',
      });

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options!.body as string);
      expect(body.payer.email).toBe('test_user_123@testuser.com');
    });

    it('should throw when MERCADOPAGO_ACCESS_TOKEN is not configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MercadoPagoPixGateway,
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('') },
          },
        ],
      }).compile();

      const gatewaySemToken =
        module.get<MercadoPagoPixGateway>(MercadoPagoPixGateway);

      await expect(
        gatewaySemToken.consultarCobranca('ORD01'),
      ).rejects.toThrow('MERCADOPAGO_ACCESS_TOKEN não configurado');
    });
  });
});
