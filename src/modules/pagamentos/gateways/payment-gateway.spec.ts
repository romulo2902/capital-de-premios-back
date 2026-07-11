import { Test, TestingModule } from '@nestjs/testing';
import { TipoPagamento } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { PagBankPixGateway } from './pagbank-pix.gateway';
import { PagBankCartaoGateway } from './pagbank-cartao.gateway';
import { Payment } from 'mercadopago';
import { MercadoPagoPixGateway } from './mercadopago-pix.gateway';
import { AgilizePayPixGateway } from './agilizepay-pix.gateway';
import { FsPayPixGateway } from './fspay-pix.gateway';
import { MockPixGateway } from './mock-pix.gateway';
import { ConfigService } from '@nestjs/config';

describe('PaymentGateway', () => {
  // ─── PaymentGatewayFactory ────────────────────────────

  describe('PaymentGatewayFactory', () => {
    let factory: PaymentGatewayFactory;
    let pagBankPixGateway: PagBankPixGateway;
    let pagBankCartaoGateway: PagBankCartaoGateway;
    let mercadoPagoPixGateway: MercadoPagoPixGateway;
    let agilizePayPixGateway: AgilizePayPixGateway;
    let fsPayPixGateway: FsPayPixGateway;
    let configValues: Record<string, string>;

    beforeEach(async () => {
      configValues = {
        MOCK_PIX_AUTO_APPROVE: 'false',
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
            provide: AgilizePayPixGateway,
            useValue: {
              criarCobranca: jest.fn(),
              consultarCobranca: jest.fn(),
              cancelarCobranca: jest.fn(),
            },
          },
          {
            provide: FsPayPixGateway,
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
      agilizePayPixGateway = module.get<AgilizePayPixGateway>(
        AgilizePayPixGateway,
      );
      fsPayPixGateway = module.get<FsPayPixGateway>(FsPayPixGateway);
    });

    it('should be defined', () => {
      expect(factory).toBeDefined();
    });

    it('should return FsPayPixGateway for TipoPagamento.PIX by default', () => {
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(fsPayPixGateway);
    });

    it('should return PagBankPixGateway when PIX_GATEWAY_PROVIDER=PAGBANK', () => {
      configValues.PIX_GATEWAY_PROVIDER = 'PAGBANK';
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(pagBankPixGateway);
    });

    it('should return MercadoPagoPixGateway when PIX_GATEWAY_PROVIDER=MERCADOPAGO', () => {
      configValues.PIX_GATEWAY_PROVIDER = 'MERCADOPAGO';
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(mercadoPagoPixGateway);
    });

    it('should return AgilizePayPixGateway when PIX_GATEWAY_PROVIDER=AGILIZEPAY', () => {
      configValues.PIX_GATEWAY_PROVIDER = 'AGILIZEPAY';
      const gateway = factory.getGateway(TipoPagamento.PIX);
      expect(gateway).toBe(agilizePayPixGateway);
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
      it('should return PagBankPixGateway when gatewayPayload has pagbankResponse', () => {
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

      it('should return AgilizePayPixGateway when gatewayPayload has agilizepayResponse, regardless of current PIX_GATEWAY_PROVIDER', () => {
        configValues.PIX_GATEWAY_PROVIDER = 'PAGBANK';
        const gateway = factory.getGatewayParaConsulta(TipoPagamento.PIX, {
          agilizepayResponse: { txid: 'abc-123' },
        });
        expect(gateway).toBe(agilizePayPixGateway);
      });

      it('should return FsPayPixGateway when gatewayPayload has fspayResponse, regardless of current PIX_GATEWAY_PROVIDER', () => {
        configValues.PIX_GATEWAY_PROVIDER = 'PAGBANK';
        const gateway = factory.getGatewayParaConsulta(TipoPagamento.PIX, {
          fspayResponse: { id: 'abc-123' },
        });
        expect(gateway).toBe(fsPayPixGateway);
      });

      it('should fall back to current provider (default FsPayPixGateway) when gatewayPayload is undefined', () => {
        const gateway = factory.getGatewayParaConsulta(TipoPagamento.PIX);
        expect(gateway).toBe(fsPayPixGateway);
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

  // ─── FsPayPixGateway ───────────────────────────────────

  describe('FsPayPixGateway', () => {
    let gateway: FsPayPixGateway;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    // JWT válido (header.payload.signature) com exp bem no futuro, só pra
    // exercitar a decodificação do token no gateway.
    const fakeJwt = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url')}.fake-signature`;

    beforeEach(async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) => {
            const config: Record<string, string> = {
              FSPAY_API_URL: 'https://api-sandbox.fspay.com.br',
              FSPAY_ACCESS_KEY: 'test-access-key',
              FSPAY_ACCESS_SECRET: 'test-access-secret',
            };
            return config[key] ?? defaultValue ?? '';
          }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FsPayPixGateway,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      gateway = module.get<FsPayPixGateway>(FsPayPixGateway);
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const mockJsonResponse = (body: unknown, ok = true, status = 200) =>
      ({
        ok,
        status,
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body),
      }) as Response;

    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('should authenticate and create a PIX transaction using vendaId as idempotency_id', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            timestamp: '2026-01-01T00:00:00Z',
            payload: { token: fakeJwt },
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            timestamp: '2026-01-01T00:00:00Z',
            payload: {
              id: 'fs_pix_123',
              txId: 'bank_tx_123',
              idempotency_id: 'venda-uuid-1',
              value: 60,
              status: 'PENDING',
              copy_paste: '00020126...',
              qr_code: 'data:image/png;base64,aGVsbG8=',
            },
          }),
        );

      const resultado = await gateway.criarCobranca({
        vendaId: 'venda-uuid-1',
        valorCentavos: 6000,
        descricao: 'Teste PIX FSPay',
        cpfPagador: '123.456.789-00',
        nomePagador: 'João Teste',
      });

      expect(resultado.gatewayId).toBe('venda-uuid-1');
      expect(resultado.pixCopiaECola).toBe('00020126...');
      expect(resultado.qrCodeBase64).toBe('data:image/png;base64,aGVsbG8=');

      const [authUrl, authInit] = fetchSpy.mock.calls[0];
      expect(authUrl).toBe('https://api-sandbox.fspay.com.br/api-auth/v1/token');
      expect((authInit?.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('test-access-key:test-access-secret').toString('base64')}`,
      );

      const [createUrl, createInit] = fetchSpy.mock.calls[1];
      expect(createUrl).toBe('https://api-sandbox.fspay.com.br/cash-in/v1/pix/create');
      const body = JSON.parse(createInit?.body as string) as {
        value: number;
        idempotency_id: string;
        document: string;
      };
      expect(body.value).toBe(60);
      expect(body.idempotency_id).toBe('venda-uuid-1');
      expect(body.document).toBe('12345678900');
    });

    it('should map get-transaction status to normalized status, querying by idempotency_id', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            timestamp: '2026-01-01T00:00:00Z',
            payload: { token: fakeJwt },
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            timestamp: '2026-01-01T00:00:00Z',
            payload: {
              id: 'fs_pix_123',
              txId: 'bank_tx_123',
              idempotency_id: 'venda-uuid-1',
              status: 'PAID',
              value: 60,
              paid_at: '2026-01-01T10:00:00Z',
            },
          }),
        );

      const resultado = await gateway.consultarCobranca('venda-uuid-1');

      expect(resultado.status).toBe('APROVADO');
      expect(resultado.paidAt).toEqual(new Date('2026-01-01T10:00:00Z'));

      const [queryUrl] = fetchSpy.mock.calls[1];
      expect(queryUrl).toBe(
        'https://api-sandbox.fspay.com.br/report/v1/api/cash-in?idempotency_id=venda-uuid-1',
      );
    });

    it('cancelarCobranca should be a no-op (no cancel endpoint documented for cash-in)', async () => {
      await expect(
        gateway.cancelarCobranca('venda-uuid-1'),
      ).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should throw with joined validation messages when the API returns a 422', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            timestamp: '2026-01-01T00:00:00Z',
            payload: { token: fakeJwt },
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse(
            {
              success: false,
              timestamp: '2026-01-01T00:00:00Z',
              message: ['value required', 'document required'],
              error: 'Bad Request',
            },
            false,
            422,
          ),
        );

      await expect(
        gateway.criarCobranca({
          vendaId: 'venda-uuid-1',
          valorCentavos: 6000,
          descricao: 'Teste',
          cpfPagador: '12345678900',
          nomePagador: 'João Teste',
        }),
      ).rejects.toThrow('value required; document required');
    });

    it('should throw when authentication fails', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse(
          {
            success: false,
            timestamp: '2026-01-01T00:00:00Z',
            message: 'INVALID_CLIENT',
            error: 'Unauthorized',
          },
          false,
          401,
        ),
      );

      await expect(
        gateway.criarCobranca({
          vendaId: 'venda-uuid-1',
          valorCentavos: 6000,
          descricao: 'Teste',
          cpfPagador: '12345678900',
          nomePagador: 'João Teste',
        }),
      ).rejects.toThrow('INVALID_CLIENT');
    });
  });

  // ─── AgilizePayPixGateway ──────────────────────────────

  describe('AgilizePayPixGateway', () => {
    let gateway: AgilizePayPixGateway;
    let fetchSpy: jest.SpiedFunction<typeof fetch>;

    beforeEach(async () => {
      const mockConfigService = {
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) => {
            const config: Record<string, string> = {
              AGILIZEPAY_API_URL: 'https://api.agilizepay.com',
              AGILIZEPAY_CLIENT_ID: 'test-client-id',
              AGILIZEPAY_CERT_CLIENT: 'test-cert-client',
            };
            return config[key] ?? defaultValue ?? '';
          }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgilizePayPixGateway,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      gateway = module.get<AgilizePayPixGateway>(AgilizePayPixGateway);
      fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const mockJsonResponse = (body: unknown, ok = true) =>
      ({
        ok,
        status: ok ? 200 : 400,
        text: () => Promise.resolve(JSON.stringify(body)),
        json: () => Promise.resolve(body),
      }) as Response;

    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('should authenticate and create a PIX transaction', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            access_token: 'token-abc',
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({
            txid: 'txid-123',
            status: 'ACTIVE',
            pixCopiaECola: '00020126...',
            qrCode: 'aGVsbG8=',
            url_checkout: 'https://checkout.agilizepay.com/txid-123',
          }),
        );

      const resultado = await gateway.criarCobranca({
        vendaId: 'venda-uuid-1',
        valorCentavos: 6000,
        descricao: 'Teste PIX AgilizePay',
        cpfPagador: '123.456.789-00',
        nomePagador: 'João Teste',
      });

      expect(resultado.gatewayId).toBe('txid-123');
      expect(resultado.pixCopiaECola).toBe('00020126...');
      expect(resultado.qrCodeBase64).toBe('aGVsbG8=');

      const [authUrl, authInit] = fetchSpy.mock.calls[0];
      expect(authUrl).toBe('https://api.agilizepay.com/auth/token');
      expect((authInit?.headers as Record<string, string>).client_id).toBe(
        'test-client-id',
      );

      const [createUrl, createInit] = fetchSpy.mock.calls[1];
      expect(createUrl).toBe('https://api.agilizepay.com/pix');
      const body = JSON.parse(createInit?.body as string) as {
        amount: number;
        document: string | null;
      };
      expect(body.amount).toBe(60);
      expect(body.document).toBe('12345678900');
    });

    it('should map get-transaction status to normalized status', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            access_token: 'token-abc',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({ txid: 'txid-123', status: 'aprovado' }),
        );

      const resultado = await gateway.consultarCobranca('txid-123');

      expect(resultado.status).toBe('APROVADO');
    });

    it('cancelarCobranca should be a no-op (no cancel endpoint documented)', async () => {
      await expect(
        gateway.cancelarCobranca('txid-123'),
      ).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should throw when the API returns an error creating a transaction', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockJsonResponse({
            success: true,
            access_token: 'token-abc',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          mockJsonResponse({ message: 'invalid amount' }, false),
        );

      await expect(
        gateway.criarCobranca({
          vendaId: 'venda-uuid-1',
          valorCentavos: 6000,
          descricao: 'Teste',
          cpfPagador: '12345678900',
          nomePagador: 'João Teste',
        }),
      ).rejects.toThrow('API AgilizePay retornou 400');
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

    it('should create a PIX payment and return the QR code data', async () => {
      const createSpy = jest
        .spyOn(Payment.prototype, 'create')
        .mockResolvedValue({
          id: 123456,
          status: 'pending',
          point_of_interaction: {
            transaction_data: {
              qr_code: '00020126580014br.gov.bcb.pix...',
              qr_code_base64: 'aGVsbG8=',
              ticket_url:
                'https://www.mercadopago.com.br/payments/123456/ticket',
            },
          },
        } as never);

      const resultado = await gateway.criarCobranca({
        vendaId: 'venda-uuid-1',
        valorCentavos: 6000,
        descricao: 'Teste PIX Mercado Pago',
        cpfPagador: '123.456.789-00',
        nomePagador: 'João Teste',
        emailPagador: 'joao@teste.com',
      });

      expect(resultado.gatewayId).toBe('123456');
      expect(resultado.pixCopiaECola).toBe('00020126580014br.gov.bcb.pix...');
      expect(resultado.qrCodeBase64).toBe('aGVsbG8=');

      const [{ body }] = createSpy.mock.calls[0];
      expect(body.transaction_amount).toBe(60);
      expect(body.payment_method_id).toBe('pix');
      expect(body.payer?.identification?.number).toBe('12345678900');
    });

    it('should expose Mercado Pago API errors thrown as plain objects', async () => {
      jest.spyOn(Payment.prototype, 'create').mockRejectedValue({
        status: 400,
        error: 'bad_request',
        message: 'invalid users involved',
        cause: [
          {
            code: 2035,
            description: 'Payer and collector cannot be equal',
          },
        ],
      });

      await expect(
        gateway.criarCobranca({
          vendaId: 'venda-uuid-1',
          valorCentavos: 6000,
          descricao: 'Teste PIX Mercado Pago',
          cpfPagador: '123.456.789-00',
          nomePagador: 'João Teste',
          emailPagador: 'joao@teste.com',
        }),
      ).rejects.toThrow(
        'Mercado Pago retornou erro (status=400; error=bad_request; message=invalid users involved; cause=code=2035, description=Payer and collector cannot be equal)',
      );
    });

    it('should map payment status approved to APROVADO', async () => {
      jest.spyOn(Payment.prototype, 'get').mockResolvedValue({
        id: 123456,
        status: 'approved',
        date_approved: '2026-01-01T10:00:00Z',
      } as never);

      const resultado = await gateway.consultarCobranca('123456');

      expect(resultado.status).toBe('APROVADO');
      expect(resultado.paidAt).toEqual(new Date('2026-01-01T10:00:00Z'));
    });

    it('should map an expired pix (cancelled + expired detail) to EXPIRADO', async () => {
      jest.spyOn(Payment.prototype, 'get').mockResolvedValue({
        id: 123456,
        status: 'cancelled',
        status_detail: 'expired',
      } as never);

      const resultado = await gateway.consultarCobranca('123456');

      expect(resultado.status).toBe('EXPIRADO');
    });

    it('should override payer email with MERCADOPAGO_SANDBOX_PAYER_EMAIL when configured', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MercadoPagoPixGateway,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation(
                (key: string, defaultValue?: string) =>
                  ({
                    MERCADOPAGO_ACCESS_TOKEN: 'test-access-token',
                    MERCADOPAGO_SANDBOX_PAYER_EMAIL:
                      'test_user_123@testuser.com',
                  })[key] ??
                  defaultValue ??
                  '',
              ),
            },
          },
        ],
      }).compile();

      const gatewaySandbox = module.get<MercadoPagoPixGateway>(
        MercadoPagoPixGateway,
      );

      const createSpy = jest
        .spyOn(Payment.prototype, 'create')
        .mockResolvedValue({
          id: 123456,
          status: 'pending',
          point_of_interaction: {
            transaction_data: { qr_code: 'abc' },
          },
        } as never);

      await gatewaySandbox.criarCobranca({
        vendaId: 'venda-uuid-1',
        valorCentavos: 6000,
        descricao: 'Teste PIX Mercado Pago',
        cpfPagador: '12345678900',
        nomePagador: 'João Teste',
        emailPagador: 'cliente.real@gmail.com',
      });

      const [{ body }] = createSpy.mock.calls[0];
      expect(body.payer?.email).toBe('test_user_123@testuser.com');
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

      const gatewaySemToken = module.get<MercadoPagoPixGateway>(
        MercadoPagoPixGateway,
      );

      await expect(
        gatewaySemToken.criarCobranca({
          vendaId: 'venda-uuid-1',
          valorCentavos: 6000,
          descricao: 'Teste',
          cpfPagador: '12345678900',
          nomePagador: 'João Teste',
        }),
      ).rejects.toThrow('MERCADOPAGO_ACCESS_TOKEN não configurado');
    });
  });
});
