import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, TipoMovimentoCredito } from '@prisma/client';
import { CreditosMaquininhaService } from './creditos-maquininha.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

const decimal = (valor: string | number) => new Prisma.Decimal(valor);

/**
 * `expect.objectContaining` devolve `any`, e aninhá-lo dentro de outro
 * matcher espalha esse `any` pelo objeto inteiro. O helper devolve `unknown`,
 * que o TypeScript aceita na posição de valor sem contaminar o resto.
 */
const contendo = (dados: Record<string, unknown>): unknown =>
  expect.objectContaining(dados);

describe('CreditosMaquininhaService', () => {
  let service: CreditosMaquininhaService;

  const mockTx = {
    maquininha: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    movimentoCreditoMaquininha: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    maquininha: { findUnique: jest.fn(), update: jest.fn() },
    movimentoCreditoMaquininha: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  };

  const admin: RequestUser = {
    id: 'user-admin',
    email: 'admin@x.com',
    cpf: null,
    perfil: 'ADMIN',
    status: 'ATIVO',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
    mockTx.movimentoCreditoMaquininha.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'mov-1',
        ...data,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditosMaquininhaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CreditosMaquininhaService>(CreditosMaquininhaService);
  });

  const tx = () => mockTx as unknown as Prisma.TransactionClient;

  describe('debitarVenda', () => {
    it('debita o valor da venda e registra o CONSUMO no razão', async () => {
      mockTx.maquininha.findUnique.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(1000),
      });
      mockTx.maquininha.updateMany.mockResolvedValue({ count: 1 });
      mockTx.maquininha.findUniqueOrThrow.mockResolvedValue({
        saldoCredito: decimal(700),
      });

      await service.debitarVenda(tx(), {
        maquininhaId: 'maq-1',
        vendaId: 'venda-1',
        valor: decimal(300),
        criadoPorId: 'user-1',
      });

      // A checagem de saldo mora no próprio UPDATE: é o `gte` no where que
      // impede duas vendas simultâneas de passarem com crédito para uma só.
      expect(mockTx.maquininha.updateMany).toHaveBeenCalledWith({
        where: { id: 'maq-1', saldoCredito: { gte: decimal(300) } },
        data: { saldoCredito: { decrement: decimal(300) } },
      });

      expect(mockTx.movimentoCreditoMaquininha.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: contendo({
            maquininhaId: 'maq-1',
            tipo: TipoMovimentoCredito.CONSUMO,
            valor: decimal(300),
            saldoAnterior: decimal(1000),
            saldoPosterior: decimal(700),
            vendaId: 'venda-1',
            vendaSenaId: null,
          }),
        }),
      );
    });

    it('recusa a venda quando o saldo não cobre o valor', async () => {
      mockTx.maquininha.findUnique
        .mockResolvedValueOnce({
          id: 'maq-1',
          numeroSerie: 'POS123',
          limiteCredito: decimal(1000),
        })
        .mockResolvedValueOnce({ saldoCredito: decimal(50) });
      // Nenhuma linha atualizada = o `gte` reprovou: saldo insuficiente.
      mockTx.maquininha.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.debitarVenda(tx(), {
          maquininhaId: 'maq-1',
          vendaId: 'venda-1',
          valor: decimal(300),
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockTx.movimentoCreditoMaquininha.create).not.toHaveBeenCalled();
    });

    it('recusa a venda quando o aparelho não tem limite definido', async () => {
      // Limite zero = ainda não configurado. Vender ali seria adiantar dinheiro
      // da casa sem teto nenhum, que é o que o controle existe para impedir.
      mockTx.maquininha.findUnique.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(0),
      });

      await expect(
        service.debitarVenda(tx(), {
          maquininhaId: 'maq-1',
          vendaId: 'venda-1',
          valor: decimal(300),
        }),
      ).rejects.toThrow(/não tem limite de crédito/);

      expect(mockTx.maquininha.updateMany).not.toHaveBeenCalled();
      expect(mockTx.movimentoCreditoMaquininha.create).not.toHaveBeenCalled();
    });

    it('ignora venda de valor zero em vez de sujar o extrato', async () => {
      mockTx.maquininha.findUnique.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(1000),
      });

      await service.debitarVenda(tx(), {
        maquininhaId: 'maq-1',
        vendaId: 'venda-1',
        valor: decimal(0),
      });

      expect(mockTx.maquininha.updateMany).not.toHaveBeenCalled();
      expect(mockTx.movimentoCreditoMaquininha.create).not.toHaveBeenCalled();
    });

    it('recusa maquininha inexistente', async () => {
      mockTx.maquininha.findUnique.mockResolvedValue(null);

      await expect(
        service.debitarVenda(tx(), {
          maquininhaId: 'maq-fantasma',
          vendaId: 'venda-1',
          valor: decimal(10),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('estornarVenda', () => {
    it('devolve o valor do CONSUMO e registra o ESTORNO', async () => {
      mockTx.movimentoCreditoMaquininha.findFirst
        .mockResolvedValueOnce({
          id: 'mov-consumo',
          valor: decimal(300),
          maquininhaId: 'maq-1',
        })
        .mockResolvedValueOnce(null);
      mockTx.maquininha.findUniqueOrThrow.mockResolvedValue({
        saldoCredito: decimal(1000),
      });

      await service.estornarVenda(tx(), {
        maquininhaId: 'maq-1',
        vendaId: 'venda-1',
        motivo: 'Cancelamento da venda: cliente desistiu',
      });

      expect(mockTx.maquininha.update).toHaveBeenCalledWith({
        where: { id: 'maq-1' },
        data: { saldoCredito: { increment: decimal(300) } },
      });
      expect(mockTx.movimentoCreditoMaquininha.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: contendo({
            tipo: TipoMovimentoCredito.ESTORNO,
            valor: decimal(300),
            saldoAnterior: decimal(700),
            saldoPosterior: decimal(1000),
            motivo: 'Cancelamento da venda: cliente desistiu',
          }),
        }),
      );
    });

    it('não estorna duas vezes a mesma venda', async () => {
      mockTx.movimentoCreditoMaquininha.findFirst
        .mockResolvedValueOnce({
          id: 'mov-consumo',
          valor: decimal(300),
          maquininhaId: 'maq-1',
        })
        .mockResolvedValueOnce({ id: 'mov-estorno' });

      await service.estornarVenda(tx(), {
        maquininhaId: 'maq-1',
        vendaId: 'venda-1',
      });

      expect(mockTx.maquininha.update).not.toHaveBeenCalled();
      expect(mockTx.movimentoCreditoMaquininha.create).not.toHaveBeenCalled();
    });

    it('não faz nada quando a venda nunca consumiu crédito', async () => {
      // Venda passada em aparelho sem limite, ou de outro canal.
      mockTx.movimentoCreditoMaquininha.findFirst.mockResolvedValue(null);

      await service.estornarVenda(tx(), {
        maquininhaId: 'maq-1',
        vendaId: 'venda-1',
      });

      expect(mockTx.maquininha.update).not.toHaveBeenCalled();
      expect(mockTx.movimentoCreditoMaquininha.create).not.toHaveBeenCalled();
    });

    it('busca o movimento pelo campo da venda Sena quando é venda Sena', async () => {
      // `{ vendaId: null }` casaria com toda recarga do aparelho — o filtro
      // precisa apontar exatamente o campo da venda em questão.
      mockTx.movimentoCreditoMaquininha.findFirst.mockResolvedValue(null);

      await service.estornarVenda(tx(), {
        maquininhaId: 'maq-1',
        vendaSenaId: 'venda-sena-1',
      });

      expect(mockTx.movimentoCreditoMaquininha.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: contendo({ vendaSenaId: 'venda-sena-1' }),
        }),
      );
    });

    it('não faz nada quando não recebe nenhum id de venda', async () => {
      await service.estornarVenda(tx(), { maquininhaId: 'maq-1' });

      expect(
        mockTx.movimentoCreditoMaquininha.findFirst,
      ).not.toHaveBeenCalled();
      expect(mockTx.maquininha.update).not.toHaveBeenCalled();
    });
  });

  describe('lancarMovimento', () => {
    it('registra a RECARGA dentro do limite', async () => {
      mockTx.maquininha.findUnique.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(1000),
      });
      mockTx.maquininha.updateMany.mockResolvedValue({ count: 1 });
      mockTx.maquininha.findUniqueOrThrow.mockResolvedValue({
        saldoCredito: decimal(800),
      });

      const resultado = await service.lancarMovimento(
        'maq-1',
        { tipo: TipoMovimentoCredito.RECARGA, valor: 500 },
        admin,
      );

      // Teto: só recarrega se saldo + valor couber no limite.
      expect(mockTx.maquininha.updateMany).toHaveBeenCalledWith({
        where: { id: 'maq-1', saldoCredito: { lte: decimal(500) } },
        data: { saldoCredito: { increment: decimal(500) } },
      });
      expect(resultado.message).toBe(
        'Movimento de crédito lançado com sucesso',
      );
    });

    it('recusa recarga que estoura o limite', async () => {
      mockTx.maquininha.findUnique
        .mockResolvedValueOnce({
          id: 'maq-1',
          numeroSerie: 'POS123',
          limiteCredito: decimal(1000),
        })
        .mockResolvedValueOnce({ saldoCredito: decimal(900) });
      mockTx.maquininha.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.lancarMovimento(
          'maq-1',
          { tipo: TipoMovimentoCredito.RECARGA, valor: 500 },
          admin,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('pede o limite antes de aceitar recarga em aparelho sem limite', async () => {
      mockTx.maquininha.findUnique.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(0),
      });

      await expect(
        service.lancarMovimento(
          'maq-1',
          { tipo: TipoMovimentoCredito.RECARGA, valor: 500 },
          admin,
        ),
      ).rejects.toThrow(/sem limite de crédito/);

      expect(mockTx.maquininha.updateMany).not.toHaveBeenCalled();
    });

    it('debita o saldo no AJUSTE_DEBITO', async () => {
      mockTx.maquininha.findUnique.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(1000),
      });
      mockTx.maquininha.updateMany.mockResolvedValue({ count: 1 });
      mockTx.maquininha.findUniqueOrThrow.mockResolvedValue({
        saldoCredito: decimal(200),
      });

      await service.lancarMovimento(
        'maq-1',
        {
          tipo: TipoMovimentoCredito.AJUSTE_DEBITO,
          valor: 100,
          motivo: 'Correção de lançamento duplicado',
        },
        admin,
      );

      expect(mockTx.maquininha.updateMany).toHaveBeenCalledWith({
        where: { id: 'maq-1', saldoCredito: { gte: decimal(100) } },
        data: { saldoCredito: { decrement: decimal(100) } },
      });
      expect(mockTx.movimentoCreditoMaquininha.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: contendo({
            tipo: TipoMovimentoCredito.AJUSTE_DEBITO,
            saldoAnterior: decimal(300),
            saldoPosterior: decimal(200),
            criadoPorId: 'user-admin',
          }),
        }),
      );
    });

    it('recusa maquininha inexistente', async () => {
      mockTx.maquininha.findUnique.mockResolvedValue(null);

      await expect(
        service.lancarMovimento(
          'maq-fantasma',
          { tipo: TipoMovimentoCredito.RECARGA, valor: 100 },
          admin,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('atualizarLimite', () => {
    it('altera o teto sem confiscar o saldo já concedido', async () => {
      mockPrisma.maquininha.findUnique.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(1000),
      });
      mockPrisma.maquininha.update.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        limiteCredito: decimal(400),
        saldoCredito: decimal(900),
      });

      const resultado = await service.atualizarLimite(
        'maq-1',
        { limiteCredito: 400 },
        admin,
      );

      // Baixar o limite não mexe no saldo: retirar crédito da mão do vendedor
      // é um AJUSTE_DEBITO explícito, que fica no extrato.
      expect(mockPrisma.maquininha.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { limiteCredito: decimal(400) },
        }),
      );
      expect(resultado.data.saldoCredito).toEqual(decimal(900));
    });

    it('recusa maquininha inexistente', async () => {
      mockPrisma.maquininha.findUnique.mockResolvedValue(null);

      await expect(
        service.atualizarLimite('maq-fantasma', { limiteCredito: 100 }, admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('extrato', () => {
    it('lista os movimentos do aparelho filtrando por tipo e período', async () => {
      mockPrisma.movimentoCreditoMaquininha.findMany.mockResolvedValue([]);
      mockPrisma.movimentoCreditoMaquininha.count.mockResolvedValue(0);

      await service.extrato('maq-1', {
        tipo: TipoMovimentoCredito.CONSUMO,
        dataInicio: '2026-09-01T00:00:00.000Z',
        dataFim: '2026-09-30T23:59:59.999Z',
      });

      expect(
        mockPrisma.movimentoCreditoMaquininha.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            maquininhaId: 'maq-1',
            tipo: TipoMovimentoCredito.CONSUMO,
            createdAt: {
              gte: new Date('2026-09-01T00:00:00.000Z'),
              lte: new Date('2026-09-30T23:59:59.999Z'),
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
