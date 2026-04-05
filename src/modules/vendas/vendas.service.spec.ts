import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, StatusEdicao, StatusVenda, TipoPagamento, OrigemParticipacao } from '@prisma/client';
import { VendasService } from './vendas.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';

describe('VendasService', () => {
  let service: VendasService;

  const mockGateway = {
    criarCobranca: jest.fn(),
    consultarCobranca: jest.fn(),
    cancelarCobranca: jest.fn(),
  };

  const mockPaymentGatewayFactory = {
    getGateway: jest.fn().mockReturnValue(mockGateway),
  };

  const mockPrisma = {
    $transaction: jest.fn(),
    venda: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    edicao: {
      findUnique: jest.fn(),
    },
    cliente: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    vendedor: {
      findUnique: jest.fn(),
    },
    distribuidor: {
      findUnique: jest.fn(),
    },
    range: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    bilhete: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    comissao: {
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendasService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentGatewayFactory, useValue: mockPaymentGatewayFactory },
      ],
    }).compile();

    service = module.get<VendasService>(VendasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findAll ──────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated data array', async () => {
      mockPrisma.venda.findMany.mockResolvedValue([]);
      mockPrisma.venda.count.mockResolvedValue(0);

      const result = await service.findAll();
      expect(result.data).toBeDefined();
      expect(result.meta).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        lastPage: 0,
      });
    });

    it('should apply filters when provided', async () => {
      mockPrisma.venda.findMany.mockResolvedValue([]);
      mockPrisma.venda.count.mockResolvedValue(0);

      await service.findAll(1, 10, {
        status: StatusVenda.PENDENTE,
        tipoPagamento: TipoPagamento.PIX,
      });

      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: StatusVenda.PENDENTE,
            tipoPagamento: TipoPagamento.PIX,
          }),
        }),
      );
    });

    it('should apply search filter on cliente', async () => {
      mockPrisma.venda.findMany.mockResolvedValue([]);
      mockPrisma.venda.count.mockResolvedValue(0);

      await service.findAll(1, 10, { search: 'Romulo' });

      expect(mockPrisma.venda.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            cliente: {
              OR: [
                { nome: { contains: 'Romulo', mode: 'insensitive' } },
                { cpf: { contains: 'Romulo' } },
              ],
            },
          }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────

  describe('findOne', () => {
    it('should return venda with includes', async () => {
      const vendaMock = {
        id: 'venda-1',
        status: StatusVenda.PENDENTE,
        total: new Prisma.Decimal('60.00'),
      };

      mockPrisma.venda.findUnique.mockResolvedValue(vendaMock);

      const result = await service.findOne('venda-1');
      expect(result.data.id).toBe('venda-1');
      expect(result.message).toBe('Venda encontrada com sucesso');
    });

    it('should throw NotFoundException if venda does not exist', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── create ───────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      edicaoId: 'edicao-1',
      quantidade: 2,
      tipoPagamento: TipoPagamento.PIX,
      cpf: '12345678900',
      nome: 'Romulo Valadares',
      telefone: '(00) 99999-9999',
    };

    const edicaoAtiva = {
      id: 'edicao-1',
      numero: 8,
      status: StatusEdicao.ATIVA,
      valorCartela: new Prisma.Decimal('30.00'),
    };

    const clienteMock = {
      id: 'cliente-1',
      cpf: '12345678900',
      nome: 'Romulo Valadares',
    };

    const vendaCriada = {
      id: 'venda-1',
      edicaoId: 'edicao-1',
      clienteId: 'cliente-1',
      quantidade: 2,
      total: new Prisma.Decimal('60.00'),
      status: StatusVenda.PENDENTE,
      tipoPagamento: TipoPagamento.PIX,
    };

    it('should create venda with PENDENTE status', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue(edicaoAtiva);
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteMock);
      mockPrisma.venda.create.mockResolvedValue(vendaCriada);
      mockPrisma.venda.findUnique.mockResolvedValue(vendaCriada);
      mockGateway.criarCobranca.mockResolvedValue({
        gatewayId: 'txid-123',
        pixCopiaECola: 'pix-copia-cola',
        payload: { txid: 'txid-123' },
      });
      mockPrisma.venda.update.mockResolvedValue(vendaCriada);

      const result = await service.create(createDto);

      expect(result.message).toBe('Venda criada com sucesso');
      expect(mockPrisma.venda.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: StatusVenda.PENDENTE,
            quantidade: 2,
            total: new Prisma.Decimal('60.00'),
          }),
        }),
      );
    });

    it('should calculate total correctly', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue(edicaoAtiva);
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteMock);
      mockPrisma.venda.create.mockResolvedValue(vendaCriada);
      mockPrisma.venda.findUnique.mockResolvedValue(vendaCriada);
      mockGateway.criarCobranca.mockResolvedValue({
        gatewayId: 'txid-123',
        pixCopiaECola: 'pix-copia-cola',
        payload: {},
      });
      mockPrisma.venda.update.mockResolvedValue(vendaCriada);

      await service.create(createDto);

      // 30.00 * 2 = 60.00
      expect(mockPrisma.venda.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total: new Prisma.Decimal('60.00'),
          }),
        }),
      );
    });

    it('should throw NotFoundException when edicao not found', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when edicao not ATIVA', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue({
        ...edicaoAtiva,
        status: StatusEdicao.RASCUNHO,
      });

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should auto-create cliente if CPF not found', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue(edicaoAtiva);
      mockPrisma.cliente.findUnique.mockResolvedValue(null); // CPF não existe
      mockPrisma.cliente.create.mockResolvedValue(clienteMock);
      mockPrisma.venda.create.mockResolvedValue(vendaCriada);
      mockPrisma.venda.findUnique.mockResolvedValue(vendaCriada);
      mockGateway.criarCobranca.mockResolvedValue({
        gatewayId: 'txid-123',
        payload: {},
      });
      mockPrisma.venda.update.mockResolvedValue(vendaCriada);

      await service.create(createDto);

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cpf: '12345678900',
            nome: 'Romulo Valadares',
          }),
        }),
      );
    });

    it('should use existing cliente when CPF already registered', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue(edicaoAtiva);
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteMock);
      mockPrisma.venda.create.mockResolvedValue(vendaCriada);
      mockPrisma.venda.findUnique.mockResolvedValue(vendaCriada);
      mockGateway.criarCobranca.mockResolvedValue({
        gatewayId: 'txid-123',
        payload: {},
      });
      mockPrisma.venda.update.mockResolvedValue(vendaCriada);

      await service.create(createDto);

      expect(mockPrisma.cliente.create).not.toHaveBeenCalled();
      expect(mockPrisma.venda.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clienteId: 'cliente-1',
          }),
        }),
      );
    });

    it('should call gateway to create cobranca', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue(edicaoAtiva);
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteMock);
      mockPrisma.venda.create.mockResolvedValue(vendaCriada);
      mockPrisma.venda.findUnique.mockResolvedValue(vendaCriada);
      mockGateway.criarCobranca.mockResolvedValue({
        gatewayId: 'txid-123',
        pixCopiaECola: 'pix-copia-cola',
        payload: {},
      });
      mockPrisma.venda.update.mockResolvedValue(vendaCriada);

      await service.create(createDto);

      expect(mockGateway.criarCobranca).toHaveBeenCalledWith(
        expect.objectContaining({
          vendaId: 'venda-1',
          valorCentavos: 6000,
          cpfPagador: '12345678900',
        }),
      );
    });
  });

  // ─── findByCliente ────────────────────────────────────

  describe('findByCliente', () => {
    it('should throw NotFoundException if cliente not found', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);

      await expect(service.findByCliente('00000000000')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return vendas for given CPF', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue({ id: 'cliente-1' });
      mockPrisma.venda.findMany.mockResolvedValue([]);
      mockPrisma.venda.count.mockResolvedValue(0);

      const result = await service.findByCliente('12345678900');
      expect(result.data).toBeDefined();
    });
  });

  // ─── confirmarPagamento ───────────────────────────────

  describe('confirmarPagamento', () => {
    const vendaPendente = {
      id: 'venda-1',
      edicaoId: 'edicao-1',
      vendedorId: 'vendedor-1',
      status: StatusVenda.PENDENTE,
      total: new Prisma.Decimal('60.00'),
      quantidade: 2,
      tipoPagamento: TipoPagamento.PIX,
      vendedor: {
        id: 'vendedor-1',
        comissaoPercent: new Prisma.Decimal('10'),
      },
      edicao: {
        rangeInicio: BigInt(1000000),
        rangeFinal: BigInt(1999999),
      },
    };

    it('should throw NotFoundException for non-existent venda', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue(null);

      await expect(service.confirmarPagamento('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when venda is not PENDENTE', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue({
        ...vendaPendente,
        status: StatusVenda.APROVADO,
      });

      await expect(service.confirmarPagamento('venda-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allocate bilhetes, create comissao and update status in transaction', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue(vendaPendente);

      const txMock = {
        edicao: {
          findUnique: jest.fn().mockResolvedValue({
            rangeInicio: BigInt(1000000),
            rangeFinal: BigInt(1999999),
          }),
        },
        range: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'range-1', numero: BigInt(1000000), sequenciaBolas: [1, 2, 3] },
            { id: 'range-2', numero: BigInt(1000001), sequenciaBolas: [4, 5, 6] },
          ]),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        bilhete: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        comissao: {
          create: jest.fn().mockResolvedValue({ id: 'comissao-1' }),
        },
        vendedor: {
          update: jest.fn().mockResolvedValue({}),
        },
        venda: {
          update: jest.fn().mockResolvedValue({
            ...vendaPendente,
            status: StatusVenda.APROVADO,
          }),
        },
      };

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock),
      );

      const result = await service.confirmarPagamento('venda-1');

      expect(result.message).toBe('Pagamento confirmado com sucesso');
      expect(txMock.bilhete.createMany).toHaveBeenCalled();
      expect(txMock.comissao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-1',
            valor: new Prisma.Decimal('6.00'), // 10% of 60.00
          }),
        }),
      );
      expect(txMock.venda.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: StatusVenda.APROVADO,
          }),
        }),
      );
    });
  });

  // ─── cancelar ─────────────────────────────────────────

  describe('cancelar', () => {
    it('should throw NotFoundException if venda not found', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue(null);

      await expect(service.cancelar('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if already cancelled', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue({
        id: 'venda-1',
        status: StatusVenda.CANCELADO,
      });

      await expect(service.cancelar('venda-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should cancel venda and release bilhetes', async () => {
      const vendaComBilhetes = {
        id: 'venda-1',
        status: StatusVenda.APROVADO,
        tipoPagamento: TipoPagamento.PIX,
        gatewayId: 'txid-123',
        gatewayPayload: {},
        vendedorId: 'vendedor-1',
        bilhetes: [
          { id: 'bilhete-1', rangeId: 'range-1' },
          { id: 'bilhete-2', rangeId: 'range-2' },
        ],
        comissao: { id: 'comissao-1', valor: new Prisma.Decimal('6.00') },
        vendedor: { id: 'vendedor-1' },
      };

      mockPrisma.venda.findUnique
        .mockResolvedValueOnce(vendaComBilhetes) // cancelar() lookup
        .mockResolvedValueOnce({ ...vendaComBilhetes, status: StatusVenda.CANCELADO }); // final lookup

      const txMock = {
        range: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
        bilhete: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        vendedor: { update: jest.fn().mockResolvedValue({}) },
        comissao: { delete: jest.fn().mockResolvedValue({}) },
        venda: { update: jest.fn().mockResolvedValue({}) },
      };

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock),
      );
      mockGateway.cancelarCobranca.mockResolvedValue(undefined);

      const result = await service.cancelar('venda-1', 'Solicitado pelo admin');

      expect(result.message).toBe('Venda cancelada com sucesso');
      expect(txMock.range.updateMany).toHaveBeenCalled();
      expect(txMock.bilhete.deleteMany).toHaveBeenCalled();
      expect(txMock.comissao.delete).toHaveBeenCalled();
      expect(mockGateway.cancelarCobranca).toHaveBeenCalledWith('txid-123');
    });
  });

  // ─── atualizarStatus ──────────────────────────────────

  describe('atualizarStatus', () => {
    it('should throw NotFoundException if venda not found', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue(null);

      await expect(
        service.atualizarStatus('inexistente', { status: StatusVenda.APROVADO }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue({
        id: 'venda-1',
        status: StatusVenda.CANCELADO,
      });

      await expect(
        service.atualizarStatus('venda-1', { status: StatusVenda.APROVADO }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow PENDENTE -> RECUSADO transition', async () => {
      mockPrisma.venda.findUnique
        .mockResolvedValueOnce({
          id: 'venda-1',
          status: StatusVenda.PENDENTE,
        });

      mockPrisma.venda.update.mockResolvedValue({
        id: 'venda-1',
        status: StatusVenda.RECUSADO,
      });

      const result = await service.atualizarStatus('venda-1', {
        status: StatusVenda.RECUSADO,
      });

      expect(result.message).toBe('Status da venda atualizado com sucesso');
    });
  });
});
