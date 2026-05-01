import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
  StatusVenda,
  TipoCartela,
  TipoPagamento,
} from '@prisma/client';
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
    matrizRange: {
      findMany: jest.fn(),
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

    it('should serialize Prisma Decimal fields in response data', async () => {
      mockPrisma.venda.findMany.mockResolvedValue([
        {
          id: 'venda-1',
          total: new Prisma.Decimal('60.00'),
          quantidade: 1,
          status: StatusVenda.PENDENTE,
        },
      ]);
      mockPrisma.venda.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.data).toEqual([
        expect.objectContaining({
          id: 'venda-1',
          total: '60.00',
        }),
      ]);
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
      dataEncerramento: new Date('2099-01-01T00:00:00.000Z'),
      valorCartela: new Prisma.Decimal('30.00'),
      detalhes: [
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.UMA_CHANCE,
          rangeInicio: BigInt(1000000),
          rangeFinal: BigInt(1999999),
          preco: null,
        },
      ],
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

    it('should throw BadRequestException when sales window is closed', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue({
        ...edicaoAtiva,
        dataEncerramento: new Date('2000-01-01T00:00:00.000Z'),
      });

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
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

    it('should block direct sales when the edition is under maintenance', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue({
        ...edicaoAtiva,
        manutencaoAtiva: true,
        manutencaoMensagem: 'Vendas pausadas para manutenção',
      });

      await expect(service.create(createDto)).rejects.toThrow(
        'Vendas pausadas para manutenção',
      );
      expect(mockPrisma.venda.create).not.toHaveBeenCalled();
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

    it('should default tipoPagamento to MANUAL for direct ADMIN sales', async () => {
      const confirmarPagamentoSpy = jest
        .spyOn(service, 'confirmarPagamento')
        .mockResolvedValue({
          message: 'Pagamento confirmado com sucesso',
          data: { id: 'venda-1', status: StatusVenda.APROVADO },
        });

      mockPrisma.edicao.findUnique.mockResolvedValue(edicaoAtiva);
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteMock);
      mockPrisma.venda.create.mockResolvedValue({
        ...vendaCriada,
        tipoPagamento: TipoPagamento.MANUAL,
      });

      const result = await service.create(
        {
          edicaoId: 'edicao-1',
          quantidade: 1,
          cpf: '12345678900',
          nome: 'Romulo Valadares',
          telefone: '(00) 99999-9999',
        },
        {
          id: 'admin-1',
          email: 'admin@capitalpremios.com',
          cpf: null,
          perfil: 'ADMIN',
          status: 'ATIVO',
        },
      );

      expect(result.message).toBe('Pagamento confirmado com sucesso');
      expect(mockPrisma.venda.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tipoPagamento: TipoPagamento.MANUAL,
          }),
        }),
      );
      expect(confirmarPagamentoSpy).toHaveBeenCalledWith(
        'venda-1',
        expect.objectContaining({
          tipoPagamento: TipoPagamento.MANUAL,
        }),
      );
    });

    it('should require tipoPagamento for non-admin sales', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue(edicaoAtiva);
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteMock);

      await expect(
        service.create({
          edicaoId: 'edicao-1',
          quantidade: 1,
          cpf: '12345678900',
          nome: 'Romulo Valadares',
          telefone: '(00) 99999-9999',
        }),
      ).rejects.toThrow(
        'tipoPagamento é obrigatório para vendas que não são diretas do ADMIN',
      );
    });

    it('should use detalhe price and persist tipoCartela when informed', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue({
        ...edicaoAtiva,
        detalhes: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.DUAS_CHANCES,
            rangeInicio: BigInt(1000000),
            rangeFinal: BigInt(1199999),
            preco: new Prisma.Decimal('25.00'),
          },
        ],
      });
      mockPrisma.cliente.findUnique.mockResolvedValue(clienteMock);
      mockPrisma.venda.create.mockResolvedValue({
        ...vendaCriada,
        tipoCartela: TipoCartela.DUAS_CHANCES,
        total: new Prisma.Decimal('50.00'),
      });
      mockPrisma.venda.findUnique.mockResolvedValue(vendaCriada);
      mockGateway.criarCobranca.mockResolvedValue({
        gatewayId: 'txid-123',
        payload: {},
      });
      mockPrisma.venda.update.mockResolvedValue(vendaCriada);

      await service.create({
        ...createDto,
        tipoCartela: TipoCartela.DUAS_CHANCES,
      });

      expect(mockPrisma.venda.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quantidade: 2,
            tipoCartela: TipoCartela.DUAS_CHANCES,
            total: new Prisma.Decimal('50.00'),
          }),
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

  describe('listarCombosDisponiveis', () => {
    it('should block combo navigation when the edition is under maintenance', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue({
        id: 'edicao-1',
        numero: 10,
        status: StatusEdicao.ATIVA,
        manutencaoAtiva: true,
        manutencaoMensagem: 'Catálogo temporariamente indisponível',
        rangeInicio: BigInt(1000000),
        rangeFinal: BigInt(1199999),
        detalhes: [],
        combos: [],
      });

      await expect(
        service.listarCombosDisponiveis({
          edicaoId: 'edicao-1',
          quantidadeCartelas: 1,
        }),
      ).rejects.toThrow('Catálogo temporariamente indisponível');
    });

    it('should return grouped deterministic combos for the requested tipoCartela', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue({
        id: 'edicao-1',
        numero: 10,
        status: StatusEdicao.ATIVA,
        rangeInicio: BigInt(1000000),
        rangeFinal: BigInt(1199999),
        detalhes: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.DUAS_CHANCES,
            rangeInicio: BigInt(1000000),
            rangeFinal: BigInt(1199999),
            preco: null,
          },
        ],
      });

      const linhas = [
        { id: 'matriz-1', numero: BigInt(1000000), sequenciaBolas: [1, 2, 3] },
        { id: 'matriz-2', numero: BigInt(1100000), sequenciaBolas: [4, 5, 6] },
      ];

      mockPrisma.matrizRange.findMany
        .mockResolvedValueOnce([linhas[0]])
        .mockResolvedValueOnce(linhas);

      const result = await service.listarCombosDisponiveis({
        edicaoId: 'edicao-1',
        tipoCartela: TipoCartela.DUAS_CHANCES,
        limit: 1,
      });

      expect(result.data.quantidadeChances).toBe(2);
      expect(result.data.combos).toEqual([
        {
          ordemSequencia: 1,
          numeroBase: '1000000',
          bilhetes: [
            {
              ordem: 1,
              matrizId: 'matriz-1',
              numero: '1000000',
              sequenciaBolas: [1, 2, 3],
            },
            {
              ordem: 2,
              matrizId: 'matriz-2',
              numero: '1100000',
              sequenciaBolas: [4, 5, 6],
            },
          ],
        },
      ]);
    });

    it('should respect manual sectors when tipoCartela has one detail per chance', async () => {
      mockPrisma.edicao.findUnique.mockResolvedValue({
        id: 'edicao-2',
        numero: 11,
        status: StatusEdicao.ATIVA,
        rangeInicio: BigInt(950000),
        rangeFinal: BigInt(2059980),
        detalhes: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.DUAS_CHANCES,
            rangeInicio: BigInt(950000),
            rangeFinal: BigInt(959980),
            preco: null,
          },
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.DUAS_CHANCES,
            rangeInicio: BigInt(1050000),
            rangeFinal: BigInt(1059980),
            preco: null,
          },
        ],
      });

      const linhas = [
        { id: 'matriz-a', numero: BigInt(950000), sequenciaBolas: [1, 2, 3] },
        { id: 'matriz-b', numero: BigInt(1050000), sequenciaBolas: [4, 5, 6] },
      ];

      mockPrisma.matrizRange.findMany
        .mockResolvedValueOnce([linhas[0]])
        .mockResolvedValueOnce(linhas);

      const result = await service.listarCombosDisponiveis({
        edicaoId: 'edicao-2',
        tipoCartela: TipoCartela.DUAS_CHANCES,
        limit: 1,
      });

      expect(result.data.rangeTotalInicio).toBe('950000');
      expect(result.data.rangeTotalFinal).toBe('1059980');
      expect(result.data.passoEntreChances).toBe('100000');
      expect(result.data.combos[0].bilhetes).toHaveLength(2);
      expect(result.data.combos[0].bilhetes[0].numero).toBe('0950000');
      expect(result.data.combos[0].bilhetes[1].numero).toBe('1050000');
    });
  });

  // ─── confirmarPagamento ───────────────────────────────

  describe('confirmarPagamento', () => {
    const vendaPendente = {
      id: 'venda-1',
      edicaoId: 'edicao-1',
      vendedorId: 'vendedor-1',
      distribuidorId: 'distribuidor-1',
      origemParticipacao: OrigemParticipacao.DIGITAL,
      status: StatusVenda.PENDENTE,
      total: new Prisma.Decimal('60.00'),
      quantidade: 2,
      tipoPagamento: TipoPagamento.PIX,
      vendedor: {
        id: 'vendedor-1',
        comissaoPercent: new Prisma.Decimal('50'),
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
            detalhes: [
              {
                origemParticipacao: OrigemParticipacao.DIGITAL,
                tipoCartela: TipoCartela.UMA_CHANCE,
                rangeInicio: BigInt(1000000),
                rangeFinal: BigInt(1999999),
                preco: null,
              },
            ],
          }),
        },
        matrizRange: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'matriz-1',
              numero: BigInt(1000000),
              sequenciaBolas: [1, 2, 3],
            },
            {
              id: 'matriz-2',
              numero: BigInt(1000001),
              sequenciaBolas: [4, 5, 6],
            },
          ]),
        },
        bilhete: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        distribuidor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'distribuidor-1',
            comissaoPercent: new Prisma.Decimal('20'), // 20% macro fatia
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        comissaoDistribuidor: {
          create: jest.fn().mockResolvedValue({}),
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
            bilhetes: [
              {
                id: 'bilhete-1',
                numero: BigInt(1000000),
                sequenciaBolas: [1, 2, 3],
                ganhador: false,
                premioId: null,
              },
            ],
          }),
        },
      };

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof txMock) => Promise<unknown>) =>
          callback(txMock),
      );

      const result = await service.confirmarPagamento('venda-1');

      expect(result.message).toBe('Pagamento confirmado com sucesso');
      expect(result.data.bilhetes).toEqual([
        expect.objectContaining({
          numero: '1000000',
        }),
      ]);
      expect(txMock.bilhete.createMany).toHaveBeenCalled();
      expect(txMock.comissao.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-1',
            valor: new Prisma.Decimal('6.00'), // 50% de 20% de 60.00
          }),
        }),
      );
      expect(txMock.comissaoDistribuidor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            distribuidorId: 'distribuidor-1',
            valor: new Prisma.Decimal('6.00'), // Os outros 50% de 20% de 60.00
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

    it('should allocate grouped numbers with fixed jump for multi-chance cartelas', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue({
        ...vendaPendente,
        quantidade: 2,
        tipoCartela: TipoCartela.DUAS_CHANCES,
      });

      const linhas = [
        { id: 'matriz-1', numero: BigInt(1000000), sequenciaBolas: [1, 2, 3] },
        { id: 'matriz-2', numero: BigInt(1000001), sequenciaBolas: [4, 5, 6] },
        { id: 'matriz-3', numero: BigInt(1100000), sequenciaBolas: [7, 8, 9] },
        {
          id: 'matriz-4',
          numero: BigInt(1100001),
          sequenciaBolas: [10, 11, 12],
        },
      ];
      const txMock = {
        edicao: {
          findUnique: jest.fn().mockResolvedValue({
            rangeInicio: BigInt(1000000),
            rangeFinal: BigInt(1199999),
            detalhes: [
              {
                origemParticipacao: OrigemParticipacao.DIGITAL,
                tipoCartela: TipoCartela.DUAS_CHANCES,
                rangeInicio: BigInt(1000000),
                rangeFinal: BigInt(1199999),
                preco: null,
              },
            ],
          }),
        },
        matrizRange: {
          findMany: jest.fn().mockImplementation(({ where }) => {
            if ('in' in where.numero) {
              return Promise.resolve(linhas);
            }

            return Promise.resolve(linhas.slice(0, 2));
          }),
        },
        bilhete: {
          createMany: jest.fn().mockResolvedValue({ count: 4 }),
        },
        distribuidor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'distribuidor-1',
            comissaoPercent: new Prisma.Decimal('20'),
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        comissaoDistribuidor: {
          create: jest.fn().mockResolvedValue({}),
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
            bilhetes: [
              {
                id: 'bilhete-1',
                numero: BigInt(1000000),
                sequenciaBolas: [1, 2, 3],
                ganhador: false,
                premioId: null,
              },
            ],
          }),
        },
      };

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof txMock) => Promise<unknown>) =>
          callback(txMock),
      );

      await service.confirmarPagamento('venda-1');

      expect(txMock.bilhete.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            numero: BigInt(1000000),
            matrizId: 'matriz-1',
          }),
          expect.objectContaining({
            numero: BigInt(1100000),
            matrizId: 'matriz-3',
          }),
          expect.objectContaining({
            numero: BigInt(1000001),
            matrizId: 'matriz-2',
          }),
          expect.objectContaining({
            numero: BigInt(1100001),
            matrizId: 'matriz-4',
          }),
        ],
      });
    });

    it('should reject multi-chance sale when partner numbers are unavailable', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue({
        ...vendaPendente,
        quantidade: 1,
        tipoCartela: TipoCartela.DUAS_CHANCES,
      });

      let chamadaFindMany = 0;
      const base = {
        id: 'matriz-1',
        numero: BigInt(1000000),
        sequenciaBolas: [1, 2, 3],
      };

      const txMock = {
        edicao: {
          findUnique: jest.fn().mockResolvedValue({
            rangeInicio: BigInt(1000000),
            rangeFinal: BigInt(1199999),
            detalhes: [
              {
                origemParticipacao: OrigemParticipacao.DIGITAL,
                tipoCartela: TipoCartela.DUAS_CHANCES,
                rangeInicio: BigInt(1000000),
                rangeFinal: BigInt(1199999),
                preco: null,
              },
            ],
          }),
        },
        matrizRange: {
          findMany: jest.fn().mockImplementation(() => {
            chamadaFindMany += 1;

            if (chamadaFindMany === 1) {
              return Promise.resolve([base]);
            }

            if (chamadaFindMany === 2) {
              return Promise.resolve([base]);
            }

            return Promise.resolve([]);
          }),
        },
        bilhete: {
          createMany: jest.fn(),
        },
        distribuidor: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        comissaoDistribuidor: {
          create: jest.fn(),
        },
        comissao: {
          create: jest.fn(),
        },
        vendedor: {
          update: jest.fn(),
        },
        venda: {
          update: jest.fn(),
        },
      };

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof txMock) => Promise<unknown>) =>
          callback(txMock),
      );

      await expect(service.confirmarPagamento('venda-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(txMock.bilhete.createMany).not.toHaveBeenCalled();
    });

    it('should allocate the exact combos selected by the cliente', async () => {
      mockPrisma.venda.findUnique.mockResolvedValue({
        ...vendaPendente,
        quantidade: 1,
        tipoCartela: TipoCartela.SEIS_CHANCES,
        gatewayPayload: {
          combosSelecionados: [{ numeroBase: '0276531' }],
        },
      });

      const linhas = [
        { id: 'matriz-1', numero: BigInt(276531), sequenciaBolas: [1, 2, 3] },
        { id: 'matriz-2', numero: BigInt(376531), sequenciaBolas: [4, 5, 6] },
        { id: 'matriz-3', numero: BigInt(476531), sequenciaBolas: [7, 8, 9] },
        {
          id: 'matriz-4',
          numero: BigInt(576531),
          sequenciaBolas: [10, 11, 12],
        },
        {
          id: 'matriz-5',
          numero: BigInt(676531),
          sequenciaBolas: [13, 14, 15],
        },
        {
          id: 'matriz-6',
          numero: BigInt(776531),
          sequenciaBolas: [16, 17, 18],
        },
      ];

      const txMock = {
        edicao: {
          findUnique: jest.fn().mockResolvedValue({
            rangeInicio: BigInt(270000),
            rangeFinal: BigInt(869999),
            detalhes: [
              {
                origemParticipacao: OrigemParticipacao.DIGITAL,
                tipoCartela: TipoCartela.SEIS_CHANCES,
                rangeInicio: BigInt(270000),
                rangeFinal: BigInt(869999),
                preco: null,
              },
            ],
          }),
        },
        matrizRange: {
          findMany: jest.fn().mockResolvedValue(linhas),
        },
        bilhete: {
          createMany: jest.fn().mockResolvedValue({ count: 6 }),
        },
        distribuidor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'distribuidor-1',
            comissaoPercent: new Prisma.Decimal('20'),
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        comissaoDistribuidor: {
          create: jest.fn().mockResolvedValue({}),
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
        async (callback: (tx: typeof txMock) => Promise<unknown>) =>
          callback(txMock),
      );

      await service.confirmarPagamento('venda-1');

      expect(txMock.bilhete.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ numero: BigInt(276531) }),
          expect.objectContaining({ numero: BigInt(376531) }),
          expect.objectContaining({ numero: BigInt(476531) }),
          expect.objectContaining({ numero: BigInt(576531) }),
          expect.objectContaining({ numero: BigInt(676531) }),
          expect.objectContaining({ numero: BigInt(776531) }),
        ],
      });
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
          { id: 'bilhete-1', matrizId: 'matriz-1', edicaoId: 'edicao-1' },
          { id: 'bilhete-2', matrizId: 'matriz-2', edicaoId: 'edicao-1' },
        ],
        comissao: { id: 'comissao-1', valor: new Prisma.Decimal('6.00') },
        vendedor: { id: 'vendedor-1' },
      };

      mockPrisma.venda.findUnique
        .mockResolvedValueOnce(vendaComBilhetes) // cancelar() lookup
        .mockResolvedValueOnce({
          ...vendaComBilhetes,
          status: StatusVenda.CANCELADO,
        }); // final lookup

      const txMock = {
        bilhete: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        vendedor: { update: jest.fn().mockResolvedValue({}) },
        comissao: { delete: jest.fn().mockResolvedValue({}) },
        venda: { update: jest.fn().mockResolvedValue({}) },
      };

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof txMock) => Promise<unknown>) =>
          callback(txMock),
      );
      mockGateway.cancelarCobranca.mockResolvedValue(undefined);

      const result = await service.cancelar('venda-1', 'Solicitado pelo admin');

      expect(result.message).toBe('Venda cancelada com sucesso');
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
        service.atualizarStatus('inexistente', {
          status: StatusVenda.APROVADO,
        }),
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
      mockPrisma.venda.findUnique.mockResolvedValueOnce({
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
