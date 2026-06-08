import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ModoSelecaoSena } from '@prisma/client';
import { VendasSenaService } from './vendas-sena.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentGatewayFactory } from '../../pagamentos/gateways/payment-gateway.factory';

type ServicePrivado = VendasSenaService & {
  gerarNumerosSurpresinha(): number[];
  gerarSetimoNumero(numeros: number[]): number;
  gerarCartelasCompraRapida(
    quantidade: number,
  ): { numeros: number[]; modoSelecao: ModoSelecaoSena }[];
  validarEGerarCartelas(
    itens: { numeros?: number[]; modoSelecao: ModoSelecaoSena }[],
  ): { numeros: number[]; modoSelecao: ModoSelecaoSena }[];
  resolverCartelasDaVenda(
    cartelas:
      | { numeros?: number[]; modoSelecao: ModoSelecaoSena }[]
      | undefined,
    quantidade: number | undefined,
    quantidadeCombo: number | null,
  ): { numeros: number[]; modoSelecao: ModoSelecaoSena }[];
  buscarOuCriarCliente(
    cpf: string,
    nome: string,
    telefone: string,
    dataNascimentoInput: string | undefined,
    email?: string,
    vendedorId?: string,
    distribuidorId?: string,
  ): Promise<unknown>;
};

describe('VendasSenaService', () => {
  let service: ServicePrivado;

  const mockPrisma = {
    $transaction: jest.fn(),
    edicaoSena: { findUnique: jest.fn() },
    vendaSena: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    cartelaSena: { create: jest.fn(), deleteMany: jest.fn() },
    cliente: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    vendedor: { findUnique: jest.fn(), update: jest.fn() },
    distribuidor: { findUnique: jest.fn(), update: jest.fn() },
    usuario: { findUnique: jest.fn() },
    comissaoSena: { create: jest.fn(), delete: jest.fn() },
    comissaoDistribuidorSena: { create: jest.fn() },
  };

  const mockPaymentGatewayFactory = { getGateway: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendasSenaService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: PaymentGatewayFactory,
          useValue: mockPaymentGatewayFactory,
        },
      ],
    }).compile();

    service = module.get<VendasSenaService>(
      VendasSenaService,
    ) as ServicePrivado;
  });

  // ─── gerarNumerosSurpresinha ─────────────────────────────

  describe('gerarNumerosSurpresinha', () => {
    it('retorna exatamente 6 números únicos entre 1 e 60, ordenados', () => {
      for (let i = 0; i < 100; i++) {
        const numeros = service.gerarNumerosSurpresinha();
        expect(numeros).toHaveLength(6);
        expect(new Set(numeros).size).toBe(6);
        expect(numeros.every((n) => n >= 1 && n <= 60)).toBe(true);
        const ordenados = [...numeros].sort((a, b) => a - b);
        expect(numeros).toEqual(ordenados);
      }
    });
  });

  // ─── gerarSetimoNumero ───────────────────────────────────

  describe('gerarSetimoNumero', () => {
    it('nunca repete com os 6 escolhidos (varredura 1000x)', () => {
      const escolhidos = [3, 12, 24, 37, 45, 58];
      const set = new Set(escolhidos);
      for (let i = 0; i < 1000; i++) {
        const setimo = service.gerarSetimoNumero(escolhidos);
        expect(setimo).toBeGreaterThanOrEqual(1);
        expect(setimo).toBeLessThanOrEqual(60);
        expect(set.has(setimo)).toBe(false);
      }
    });
  });

  // ─── Compra rápida (diferenciação) ───────────────────────

  describe('gerarCartelasCompraRapida', () => {
    it('gera a quantidade pedida, todas com modoSelecao=SURPRESINHA', () => {
      const cartelas = service.gerarCartelasCompraRapida(7);
      expect(cartelas).toHaveLength(7);
      cartelas.forEach((c) => {
        expect(c.modoSelecao).toBe(ModoSelecaoSena.SURPRESINHA);
        expect(c.numeros).toHaveLength(6);
        expect(new Set(c.numeros).size).toBe(6);
      });
    });

    it('produz cartelas únicas entre si quando N é pequeno (50)', () => {
      const cartelas = service.gerarCartelasCompraRapida(50);
      const assinaturas = cartelas.map((c) => c.numeros.join(','));
      const unicas = new Set(assinaturas);
      expect(unicas.size).toBe(cartelas.length);
    });

    it('cada cartela respeita 6 números únicos + 7º distinto (composto)', () => {
      const cartelas = service.gerarCartelasCompraRapida(20);
      cartelas.forEach((c) => {
        const setimo = service.gerarSetimoNumero(c.numeros);
        const todos = [...c.numeros, setimo];
        expect(new Set(todos).size).toBe(7);
        expect(todos.every((n) => n >= 1 && n <= 60)).toBe(true);
      });
    });
  });

  // ─── validarEGerarCartelas (modo MANUAL) ─────────────────

  describe('validarEGerarCartelas', () => {
    it('aceita MANUAL com 6 números válidos e ordena retornado', () => {
      const itens = [
        { numeros: [58, 3, 24, 12, 45, 37], modoSelecao: ModoSelecaoSena.MANUAL },
      ];
      const resultado = service.validarEGerarCartelas(itens);
      expect(resultado).toHaveLength(1);
      expect(resultado[0].numeros).toEqual([3, 12, 24, 37, 45, 58]);
      expect(resultado[0].modoSelecao).toBe(ModoSelecaoSena.MANUAL);
    });

    it('rejeita MANUAL com números repetidos', () => {
      expect(() =>
        service.validarEGerarCartelas([
          { numeros: [3, 3, 12, 24, 45, 58], modoSelecao: ModoSelecaoSena.MANUAL },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejeita MANUAL com número fora do intervalo 1-60', () => {
      expect(() =>
        service.validarEGerarCartelas([
          { numeros: [0, 12, 24, 37, 45, 58], modoSelecao: ModoSelecaoSena.MANUAL },
        ]),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validarEGerarCartelas([
          { numeros: [3, 12, 24, 37, 45, 61], modoSelecao: ModoSelecaoSena.MANUAL },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejeita MANUAL com menos de 6 números', () => {
      expect(() =>
        service.validarEGerarCartelas([
          { numeros: [3, 12, 24, 37, 45], modoSelecao: ModoSelecaoSena.MANUAL },
        ]),
      ).toThrow(BadRequestException);
    });

    it('SURPRESINHA ignora números fornecidos e gera novos', () => {
      const resultado = service.validarEGerarCartelas([
        { numeros: [1, 2, 3, 4, 5, 6], modoSelecao: ModoSelecaoSena.SURPRESINHA },
      ]);
      expect(resultado[0].numeros).toHaveLength(6);
      expect(resultado[0].modoSelecao).toBe(ModoSelecaoSena.SURPRESINHA);
    });
  });

  // ─── resolverCartelasDaVenda ────────────────────────────

  describe('resolverCartelasDaVenda', () => {
    it('usa cartelas explícitas quando informadas', () => {
      const cartelas = service.resolverCartelasDaVenda(
        [{ numeros: [3, 12, 24, 37, 45, 58], modoSelecao: ModoSelecaoSena.MANUAL }],
        undefined,
        null,
      );
      expect(cartelas).toHaveLength(1);
      expect(cartelas[0].numeros).toEqual([3, 12, 24, 37, 45, 58]);
    });

    it('gera compra rápida pelo combo quando cartelas vazio', () => {
      const cartelas = service.resolverCartelasDaVenda(undefined, undefined, 5);
      expect(cartelas).toHaveLength(5);
      cartelas.forEach((c) => {
        expect(c.modoSelecao).toBe(ModoSelecaoSena.SURPRESINHA);
      });
    });

    it('combo tem prioridade sobre quantidade na compra rápida', () => {
      const cartelas = service.resolverCartelasDaVenda(undefined, 10, 3);
      expect(cartelas).toHaveLength(3);
    });

    it('usa quantidade quando cartelas vazio e sem combo', () => {
      const cartelas = service.resolverCartelasDaVenda(undefined, 4, null);
      expect(cartelas).toHaveLength(4);
    });

    it('lança BadRequest quando não há cartelas, quantidade nem combo', () => {
      expect(() =>
        service.resolverCartelasDaVenda(undefined, undefined, null),
      ).toThrow(BadRequestException);
      expect(() =>
        service.resolverCartelasDaVenda([], undefined, null),
      ).toThrow(BadRequestException);
    });
  });

  describe('buscarOuCriarCliente', () => {
    const gerarDataNascimento = (idade: number): string => {
      const data = new Date();
      data.setUTCFullYear(data.getUTCFullYear() - idade);
      return data.toISOString().slice(0, 10);
    };

    it('bloqueia cadastro Sena de cliente menor de 18 anos', async () => {
      await expect(
        service.buscarOuCriarCliente(
          '12345678900',
          'Cliente Menor',
          '(11) 99999-9999',
          gerarDataNascimento(17),
        ),
      ).rejects.toThrow('Produto proibido para menores de 18 anos');

      expect(mockPrisma.cliente.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.cliente.create).not.toHaveBeenCalled();
      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
    });

    it('bloqueia compra Sena quando cliente existente salvo é menor de idade', async () => {
      const dataNascimentoMenor = new Date();
      dataNascimentoMenor.setUTCFullYear(
        dataNascimentoMenor.getUTCFullYear() - 17,
      );
      mockPrisma.cliente.findUnique.mockResolvedValue({
        id: 'cliente-menor',
        cpf: '12345678900',
        nome: 'Cliente Menor',
        telefone: '(11) 99999-9999',
        dataNascimento: dataNascimentoMenor,
      });

      await expect(
        service.buscarOuCriarCliente(
          '12345678900',
          'Cliente Menor',
          '(11) 99999-9999',
          '1990-01-01',
        ),
      ).rejects.toThrow('Produto proibido para menores de 18 anos');

      expect(mockPrisma.cliente.create).not.toHaveBeenCalled();
      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
    });

    it('exige data de nascimento para concluir compra Sena', async () => {
      await expect(
        service.buscarOuCriarCliente(
          '12345678900',
          'Cliente Sem Data',
          '(11) 99999-9999',
          undefined,
        ),
      ).rejects.toThrow('dataNascimento é obrigatória para concluir a compra');

      expect(mockPrisma.cliente.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.cliente.create).not.toHaveBeenCalled();
      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
    });
  });
});
