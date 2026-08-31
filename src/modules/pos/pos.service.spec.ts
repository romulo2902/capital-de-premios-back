import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrigemParticipacao, StatusVenda, TipoPagamento } from '@prisma/client';
import { PosService } from './pos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { VendasSenaService } from '../capital-sena/vendas-sena/vendas-sena.service';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';
import { RedisService } from '../../common/redis/redis.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

describe('PosService', () => {
  let service: PosService;

  const mockPrisma = {
    edicao: { findMany: jest.fn() },
    edicaoSena: { findMany: jest.fn() },
    cliente: { findFirst: jest.fn() },
    vendedor: { findUnique: jest.fn() },
    venda: { findUnique: jest.fn(), update: jest.fn() },
    vendaSena: { findUnique: jest.fn(), update: jest.fn() },
  };

  const mockVendas = {
    create: jest.fn(),
    confirmarPagamento: jest.fn(),
    listarCombosDisponiveis: jest.fn(),
  };

  const mockVendasSena = {
    create: jest.fn(),
    confirmarPagamento: jest.fn(),
  };

  const mockPaymentGatewayFactory = {
    getGatewayParaConsulta: jest.fn().mockReturnValue({
      consultarCobranca: jest.fn().mockResolvedValue({ status: 'PENDENTE' }),
    }),
  };

  const mockRedisService = {
    isConfigured: jest.fn().mockReturnValue(false),
    client: null,
  };

  const vendedor: RequestUser = {
    id: 'user-1',
    email: null,
    cpf: '12345678900',
    perfil: 'VENDEDOR',
    status: 'ATIVO',
    vendedorId: 'vend-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      distribuidorId: 'dist-1',
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VendasService, useValue: mockVendas },
        { provide: VendasSenaService, useValue: mockVendasSena },
        { provide: PaymentGatewayFactory, useValue: mockPaymentGatewayFactory },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<PosService>(PosService);
  });

  it('cria venda forçando origem POS, ids do token e cobrança via API', async () => {
    mockVendas.create.mockResolvedValue({ data: { id: 'venda-1' } });

    await service.criarVenda(
      {
        edicaoId: 'ed-1',
        cpf: '1',
        nome: 'X',
        telefone: '1',
        dataNascimento: '1990-01-01',
        tipoPagamento: TipoPagamento.PIX,
      } as never,
      vendedor,
    );

    // O guard do token remove o campo oposto: para VENDEDOR o distribuidorId
    // e derivado no service, nunca aceito da entrada.
    const dtoEnviado = mockVendas.create.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect('distribuidorId' in dtoEnviado).toBe(false);

    expect(mockVendas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendedorId: 'vend-1',
      }),
      vendedor,
      {
        origemParticipacao: OrigemParticipacao.POS,
        requireGateway: true,
      },
    );
  });

  it('cria venda manual no POS sem exigir gateway', async () => {
    mockVendas.create.mockResolvedValue({ data: { id: 'venda-manual-1' } });

    await service.criarVenda(
      {
        edicaoId: 'ed-1',
        cpf: '1',
        nome: 'X',
        telefone: '1',
        dataNascimento: '1990-01-01',
        tipoPagamento: TipoPagamento.MANUAL,
      } as never,
      vendedor,
    );

    expect(mockVendas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoPagamento: TipoPagamento.MANUAL,
        vendedorId: 'vend-1',
      }),
      vendedor,
      {
        origemParticipacao: OrigemParticipacao.POS,
        requireGateway: false,
      },
    );
  });

  it('busca cliente por CPF em toda a base para autofill do POS', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValue({
      id: 'cliente-1',
      cpf: '12345678900',
      nome: 'Maria Cliente',
      telefone: '(11) 99999-9999',
      email: 'maria.cliente@email.com',
      dataNascimento: new Date('1985-04-11T00:00:00.000Z'),
      cidade: 'São Paulo',
      estado: 'SP',
    });

    const result = await service.buscarClientePorCpf('123.456.789-00');

    // Sem filtro de vínculo: o terminal atende quem chega no balcão, então a
    // busca é só pelo CPF — nos dois formatos em que ele pode estar gravado.
    expect(mockPrisma.vendedor.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.cliente.findFirst).toHaveBeenCalledWith({
      where: { cpf: { in: ['12345678900', '123.456.789-00'] } },
      select: {
        id: true,
        cpf: true,
        nome: true,
        telefone: true,
        email: true,
        dataNascimento: true,
        cidade: true,
        estado: true,
      },
    });
    expect(result).toEqual({
      message: 'Cliente encontrado com sucesso',
      data: {
        encontrado: true,
        cliente: {
          id: 'cliente-1',
          cpf: '12345678900',
          nome: 'Maria Cliente',
          telefone: '(11) 99999-9999',
          email: 'maria.cliente@email.com',
          dataNascimento: '1985-04-11',
          cidade: 'São Paulo',
          estado: 'SP',
        },
      },
    });
  });

  it('acha cliente de outra rede e cliente sem vínculo nenhum', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValue({
      id: 'cliente-de-outra-rede',
      cpf: '98765432100',
      nome: 'Cliente Alheio',
      telefone: '(21) 98888-7777',
      email: null,
      dataNascimento: null,
      cidade: null,
      estado: null,
    });

    const result = await service.buscarClientePorCpf('98765432100');

    expect(result.data).toMatchObject({
      encontrado: true,
      cliente: { id: 'cliente-de-outra-rede', dataNascimento: null },
    });
  });

  it('retorna encontrado false quando o CPF não existe na base', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValue(null);

    const result = await service.buscarClientePorCpf('12345678900');

    expect(result).toEqual({
      message: 'Cliente não encontrado',
      data: {
        encontrado: false,
        cliente: null,
      },
    });
  });

  it('rejeita venda POS com cartão', async () => {
    await expect(
      service.criarVenda(
        {
          edicaoId: 'ed-1',
          cpf: '1',
          nome: 'X',
          telefone: '1',
          dataNascimento: '1990-01-01',
          tipoPagamento: TipoPagamento.CARTAO,
        } as never,
        vendedor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('consulta status de pagamento da venda POS', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.POS,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: 'vend-1',
      distribuidorId: null,
      gatewayId: 'ORDE_1',
      total: { toString: () => '20.00' },
      createdAt: new Date('2026-05-28T14:30:00.000Z'),
    });

    const result = await service.consultarStatusPagamento('venda-1', vendedor);

    expect(
      mockPaymentGatewayFactory.getGatewayParaConsulta,
    ).toHaveBeenCalledWith(TipoPagamento.PIX, undefined);
    expect(result.data).toMatchObject({
      vendaId: 'venda-1',
      status: StatusVenda.PENDENTE,
      statusGateway: 'PENDENTE',
      pago: false,
    });
  });

  it('confirma a venda POS no polling quando o gateway já aprovou', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.POS,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: 'vend-1',
      distribuidorId: null,
      gatewayId: 'ORDE_1',
      total: { toString: () => '20.00' },
      createdAt: new Date('2026-05-28T14:30:00.000Z'),
    });
    mockPaymentGatewayFactory.getGatewayParaConsulta.mockReturnValue({
      consultarCobranca: jest.fn().mockResolvedValue({
        status: 'APROVADO',
        paidAt: new Date('2026-05-28T14:35:00.000Z'),
        payload: { orderId: 'ORDE_1' },
      }),
    });
    mockVendas.confirmarPagamento.mockResolvedValue({
      data: { id: 'venda-1', status: StatusVenda.APROVADO },
    });

    const result = await service.consultarStatusPagamento('venda-1', vendedor);

    expect(mockVendas.confirmarPagamento).toHaveBeenCalledWith(
      'venda-1',
      expect.objectContaining({
        gatewayPolling: { orderId: 'ORDE_1' },
      }),
    );
    expect(result.data).toMatchObject({
      vendaId: 'venda-1',
      status: StatusVenda.APROVADO,
      statusGateway: 'APROVADO',
      pago: true,
    });
  });

  it('confirma venda POS unitária reaproveitando ranges DIGITAL', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.POS,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: 'vend-1',
      distribuidorId: null,
      gatewayId: 'ORDE_1',
      total: { toString: () => '10.00' },
      createdAt: new Date('2026-05-28T14:30:00.000Z'),
    });
    mockPaymentGatewayFactory.getGatewayParaConsulta.mockReturnValue({
      consultarCobranca: jest.fn().mockResolvedValue({
        status: 'APROVADO',
        payload: { orderId: 'ORDE_1' },
      }),
    });
    mockVendas.confirmarPagamento.mockResolvedValue({
      data: { id: 'venda-1', status: StatusVenda.APROVADO },
    });

    const result = await service.consultarStatusPagamento('venda-1', vendedor);

    expect(mockVendas.confirmarPagamento).toHaveBeenCalled();
    expect(result.data.status).toBe(StatusVenda.APROVADO);
  });

  it('rejeita consulta de status de venda que não é POS', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.DIGITAL,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: 'vend-1',
      distribuidorId: null,
      gatewayId: 'ORDE_1',
      total: { toString: () => '20.00' },
      createdAt: new Date(),
    });

    await expect(
      service.consultarStatusPagamento('venda-1', vendedor),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejeita consulta de status de venda de outro operador', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.POS,
      tipoPagamento: TipoPagamento.PIX,
      vendedorId: 'outro-vend',
      distribuidorId: null,
      gatewayId: 'ORDE_1',
      total: { toString: () => '20.00' },
      createdAt: new Date(),
    });

    await expect(
      service.consultarStatusPagamento('venda-1', vendedor),
    ).rejects.toThrow(ForbiddenException);
  });
  describe('criarVendaSena — forma de pagamento', () => {
    const base = {
      edicaoSenaId: 'ed-sena-1',
      cpf: '1',
      nome: 'X',
      telefone: '1',
      dataNascimento: '1990-01-01',
      modoSelecao: 'MANUAL',
      numeros: [{ numeros: [1, 2, 3, 4, 5, 6], bola_extra: 7 }],
    };

    it('usa PIX quando o tipo é omitido, e exige gateway', async () => {
      mockVendasSena.create.mockResolvedValue({ data: { id: 'venda-1' } });

      await service.criarVendaSena({ ...base } as never, vendedor);

      const [dtoEnviado, , options] = mockVendasSena.create.mock.calls[0] as [
        Record<string, unknown>,
        unknown,
        Record<string, unknown>,
      ];
      expect(dtoEnviado.tipoPagamento).toBe(TipoPagamento.PIX);
      expect(options.requireGateway).toBe(true);
    });

    it('MANUAL passa adiante e dispensa o gateway', async () => {
      mockVendasSena.create.mockResolvedValue({ data: { id: 'venda-1' } });

      await service.criarVendaSena(
        { ...base, tipoPagamento: TipoPagamento.MANUAL } as never,
        vendedor,
      );

      const [dtoEnviado, , options] = mockVendasSena.create.mock.calls[0] as [
        Record<string, unknown>,
        unknown,
        Record<string, unknown>,
      ];
      // Antes o service sobrescrevia com PIX e forçava requireGateway.
      expect(dtoEnviado.tipoPagamento).toBe(TipoPagamento.MANUAL);
      expect(options.requireGateway).toBe(false);
    });

    it('CARTAO continua recusado no POS', () => {
      // `criarVendaSena` não é async: a validação lança antes de qualquer
      // await, então o erro é síncrono e não uma promise rejeitada.
      expect(() =>
        service.criarVendaSena(
          { ...base, tipoPagamento: TipoPagamento.CARTAO } as never,
          vendedor,
        ),
      ).toThrow(BadRequestException);
      expect(mockVendasSena.create).not.toHaveBeenCalled();
    });
  });
});
