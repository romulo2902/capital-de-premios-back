import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrigemParticipacao, StatusVenda } from '@prisma/client';
import { PosService } from './pos.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { VendasSenaService } from '../capital-sena/vendas-sena/vendas-sena.service';
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
      ],
    }).compile();

    service = module.get<PosService>(PosService);
  });

  it('cria venda forçando origem POS, ids do token e skipGateway', () => {
    mockVendas.create.mockResolvedValue({ data: { id: 'venda-1' } });

    service.criarVenda(
      { edicaoId: 'ed-1', cpf: '1', nome: 'X', telefone: '1', dataNascimento: '1990-01-01' } as never,
      vendedor,
    );

    expect(mockVendas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        origemParticipacao: OrigemParticipacao.POS,
        vendedorId: 'vend-1',
        distribuidorId: undefined,
      }),
      vendedor,
      { skipGateway: true },
    );
  });

  it('confirma pagamento aprovado e delega geração de cartelas', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.POS,
      vendedorId: 'vend-1',
      distribuidorId: null,
      gatewayPayload: null,
    });
    mockPrisma.venda.update.mockResolvedValue({});
    mockVendas.confirmarPagamento.mockResolvedValue({ data: { id: 'venda-1' } });

    await service.confirmarPagamento(
      'venda-1',
      { transacaoId: 'CHAR_1', status: 'PAID' },
      vendedor,
    );

    expect(mockVendas.confirmarPagamento).toHaveBeenCalledWith(
      'venda-1',
      expect.objectContaining({
        pagamentoPos: expect.objectContaining({ transacaoId: 'CHAR_1' }),
      }),
    );
  });

  it('marca RECUSADO e não gera cartelas quando pagamento não aprovado', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.POS,
      vendedorId: 'vend-1',
      distribuidorId: null,
      gatewayPayload: null,
    });
    mockPrisma.venda.update.mockResolvedValue({});

    const result = await service.confirmarPagamento(
      'venda-1',
      { transacaoId: 'CHAR_1', status: 'DECLINED' },
      vendedor,
    );

    expect(mockVendas.confirmarPagamento).not.toHaveBeenCalled();
    expect(mockPrisma.venda.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: StatusVenda.RECUSADO }),
      }),
    );
    expect((result.data as { status: string }).status).toBe(
      StatusVenda.RECUSADO,
    );
  });

  it('rejeita confirmação de venda que não é POS', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.DIGITAL,
      vendedorId: 'vend-1',
      distribuidorId: null,
      gatewayPayload: null,
    });

    await expect(
      service.confirmarPagamento(
        'venda-1',
        { transacaoId: 'CHAR_1', status: 'PAID' },
        vendedor,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejeita confirmação de venda de outro operador', async () => {
    mockPrisma.venda.findUnique.mockResolvedValue({
      id: 'venda-1',
      status: StatusVenda.PENDENTE,
      origemParticipacao: OrigemParticipacao.POS,
      vendedorId: 'outro-vend',
      distribuidorId: null,
      gatewayPayload: null,
    });

    await expect(
      service.confirmarPagamento(
        'venda-1',
        { transacaoId: 'CHAR_1', status: 'PAID' },
        vendedor,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
