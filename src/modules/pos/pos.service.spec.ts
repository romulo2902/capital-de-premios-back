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
    getGateway: jest.fn().mockReturnValue({
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

    expect(mockVendas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        vendedorId: 'vend-1',
        distribuidorId: undefined,
      }),
      vendedor,
      {
        origemParticipacao: OrigemParticipacao.POS,
        requireGateway: true,
      },
    );
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

    expect(mockPaymentGatewayFactory.getGateway).toHaveBeenCalledWith(
      TipoPagamento.PIX,
    );
    expect(result.data).toMatchObject({
      vendaId: 'venda-1',
      status: StatusVenda.PENDENTE,
      statusGateway: 'PENDENTE',
      pago: false,
    });
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

    await expect(service.consultarStatusPagamento('venda-1', vendedor)).rejects.toThrow(
      NotFoundException,
    );
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

    await expect(service.consultarStatusPagamento('venda-1', vendedor)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
