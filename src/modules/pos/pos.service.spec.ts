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
import { VendedoresService } from '../vendedores/vendedores.service';
import { MaquininhasService } from '../maquininhas/maquininhas.service';
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

  const mockVendedores = {
    create: jest.fn(),
    findAll: jest.fn(),
  };

  const mockMaquininhas = {
    garantirMaquininhaDoOperador: jest.fn(),
  };

  const mockRedisService = {
    isConfigured: jest.fn().mockReturnValue(false),
    client: null,
  };

  const distribuidor: RequestUser = {
    id: 'user-2',
    email: null,
    cpf: '98765432100',
    perfil: 'DISTRIBUIDOR',
    status: 'ATIVO',
    distribuidorId: 'dist-1',
  };

  const novoVendedorDto = {
    nome: 'Maria da Silva',
    cpf: '008.016.371-80',
    telefone: '(61) 99233-9525',
    email: 'maria.vendedora@email.com',
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
        { provide: VendedoresService, useValue: mockVendedores },
        { provide: MaquininhasService, useValue: mockMaquininhas },
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
  describe('cadastrarVendedor', () => {
    it('força o distribuidorId do token ao cadastrar o vendedor', async () => {
      mockVendedores.create.mockResolvedValue({
        id: 'vend-novo',
        codigo: 4933,
        nome: 'Maria da Silva',
      });

      const resultado = await service.cadastrarVendedor(
        novoVendedorDto as never,
        distribuidor,
      );

      expect(mockVendedores.create).toHaveBeenCalledWith({
        ...novoVendedorDto,
        distribuidorId: 'dist-1',
      });
      expect(resultado.data).toEqual(
        expect.objectContaining({ id: 'vend-novo' }),
      );
    });

    it('sobrescreve distribuidorId que venha no corpo pelo do token', async () => {
      mockVendedores.create.mockResolvedValue({ id: 'vend-novo', codigo: 1 });

      await service.cadastrarVendedor(
        { ...novoVendedorDto, distribuidorId: 'rede-alheia' } as never,
        distribuidor,
      );

      const [dtoEnviado] = mockVendedores.create.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(dtoEnviado.distribuidorId).toBe('dist-1');
    });

    it('bloqueia o perfil VENDEDOR', async () => {
      await expect(
        service.cadastrarVendedor(novoVendedorDto as never, vendedor),
      ).rejects.toThrow(ForbiddenException);
      expect(mockVendedores.create).not.toHaveBeenCalled();
    });

    it('bloqueia distribuidor sem vínculo de rede no token', async () => {
      await expect(
        service.cadastrarVendedor(novoVendedorDto as never, {
          ...distribuidor,
          distribuidorId: undefined,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockVendedores.create).not.toHaveBeenCalled();
    });
  });

  describe('listarVendedoresDaRede', () => {
    it('lista sem aceitar filtro de rede, delegando o recorte ao token', async () => {
      mockVendedores.findAll.mockResolvedValue({ data: [], meta: {} });

      await service.listarVendedoresDaRede(
        { page: 2, limit: 10, search: 'Maria' },
        distribuidor,
      );

      expect(mockVendedores.findAll).toHaveBeenCalledWith(
        2,
        10,
        'Maria',
        undefined,
        distribuidor,
      );
    });

    it('bloqueia o perfil VENDEDOR', async () => {
      await expect(
        service.listarVendedoresDaRede({}, vendedor),
      ).rejects.toThrow(ForbiddenException);
      expect(mockVendedores.findAll).not.toHaveBeenCalled();
    });
  });
  describe('maquininha na venda POS', () => {
    it('valida a maquininha e repassa o id por options, fora do dto', async () => {
      mockVendas.create.mockResolvedValue({ data: { id: 'venda-1' } });
      mockMaquininhas.garantirMaquininhaDoOperador.mockResolvedValue('maq-1');

      await service.criarVenda(
        {
          edicaoId: 'ed-1',
          cpf: '1',
          nome: 'X',
          telefone: '1',
          dataNascimento: '1990-01-01',
          tipoPagamento: TipoPagamento.PIX,
          maquininhaId: 'maq-1',
        } as never,
        vendedor,
      );

      expect(mockMaquininhas.garantirMaquininhaDoOperador).toHaveBeenCalledWith(
        'maq-1',
        vendedor,
      );

      const [dtoEnviado, , options] = mockVendas.create.mock.calls[0] as [
        Record<string, unknown>,
        unknown,
        Record<string, unknown>,
      ];
      // O campo é do canal POS: não pode vazar para o dto compartilhado.
      expect(dtoEnviado.maquininhaId).toBeUndefined();
      expect(options.maquininhaId).toBe('maq-1');
    });

    it('venda sem maquininha não consulta o service nem manda o campo', async () => {
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

      expect(
        mockMaquininhas.garantirMaquininhaDoOperador,
      ).not.toHaveBeenCalled();
      const [, , options] = mockVendas.create.mock.calls[0] as [
        unknown,
        unknown,
        Record<string, unknown>,
      ];
      expect(options.maquininhaId).toBeUndefined();
    });

    it('propaga a recusa da maquininha sem criar a venda', async () => {
      mockMaquininhas.garantirMaquininhaDoOperador.mockRejectedValue(
        new NotFoundException('Maquininha não encontrada'),
      );

      await expect(
        service.criarVenda(
          {
            edicaoId: 'ed-1',
            cpf: '1',
            nome: 'X',
            telefone: '1',
            dataNascimento: '1990-01-01',
            tipoPagamento: TipoPagamento.PIX,
            maquininhaId: 'maq-alheia',
          } as never,
          vendedor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockVendas.create).not.toHaveBeenCalled();
    });

    it('vale também para a venda Sena', async () => {
      mockVendasSena.create.mockResolvedValue({ data: { id: 'venda-sena-1' } });
      mockMaquininhas.garantirMaquininhaDoOperador.mockResolvedValue('maq-1');

      await service.criarVendaSena(
        {
          edicaoSenaId: 'ed-sena-1',
          cpf: '1',
          nome: 'X',
          telefone: '1',
          dataNascimento: '1990-01-01',
          modoSelecao: 'MANUAL',
          numeros: [{ numeros: [1, 2, 3, 4, 5, 6], bola_extra: 7 }],
          maquininhaId: 'maq-1',
        } as never,
        vendedor,
      );

      const [dtoEnviado, , options] = mockVendasSena.create.mock.calls[0] as [
        Record<string, unknown>,
        unknown,
        Record<string, unknown>,
      ];
      expect(dtoEnviado.maquininhaId).toBeUndefined();
      expect(options.maquininhaId).toBe('maq-1');
    });
  });
});
