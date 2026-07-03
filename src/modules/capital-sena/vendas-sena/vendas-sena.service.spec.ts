import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ModoSelecaoSena } from '@prisma/client';
import { VendasSenaService } from './vendas-sena.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentGatewayFactory } from '../../pagamentos/gateways/payment-gateway.factory';

type ServicePrivado = VendasSenaService & {
  validarNumerosDaVenda(
    itens: {
      numeros: number[];
      bola_extra: number;
    }[],
    modoSelecao: ModoSelecaoSena,
  ): { numeros: number[]; bolaExtra: number; modoSelecao: ModoSelecaoSena }[];
  resolverCartelasDaVenda(
    numeros:
      | {
          numeros: number[];
          bola_extra: number;
        }[]
      | undefined,
    modoSelecao: ModoSelecaoSena | undefined,
    quantidade: number | undefined,
    quantidadeCombo: number | null,
  ): { numeros: number[]; bolaExtra: number; modoSelecao: ModoSelecaoSena }[];
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

  // ─── validarNumerosDaVenda ───────────────────────────────

  describe('validarNumerosDaVenda', () => {
    it('aceita 6 números válidos com bola extra e preserva a ordem recebida', () => {
      const itens = [
        {
          numeros: [58, 3, 24, 12, 45, 37],
          bola_extra: 7,
        },
      ];
      const resultado = service.validarNumerosDaVenda(
        itens,
        ModoSelecaoSena.MANUAL,
      );
      expect(resultado).toHaveLength(1);
      expect(resultado[0].numeros).toEqual([58, 3, 24, 12, 45, 37]);
      expect(resultado[0].bolaExtra).toBe(7);
      expect(resultado[0].modoSelecao).toBe(ModoSelecaoSena.MANUAL);
    });

    it('preserva modoSelecao=SURPRESINHA mesmo com números enviados pelo frontend', () => {
      const resultado = service.validarNumerosDaVenda(
        [
          {
            numeros: [1, 2, 3, 4, 5, 6],
            bola_extra: 7,
          },
        ],
        ModoSelecaoSena.SURPRESINHA,
      );

      expect(resultado[0]).toMatchObject({
        numeros: [1, 2, 3, 4, 5, 6],
        bolaExtra: 7,
        modoSelecao: ModoSelecaoSena.SURPRESINHA,
      });
    });

    it('rejeita números repetidos', () => {
      expect(() =>
        service.validarNumerosDaVenda(
          [
            {
              numeros: [3, 3, 12, 24, 45, 58],
              bola_extra: 7,
            },
          ],
          ModoSelecaoSena.MANUAL,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejeita número fora do intervalo 1-60', () => {
      expect(() =>
        service.validarNumerosDaVenda(
          [
            {
              numeros: [0, 12, 24, 37, 45, 58],
              bola_extra: 7,
            },
          ],
          ModoSelecaoSena.MANUAL,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validarNumerosDaVenda(
          [
            {
              numeros: [3, 12, 24, 37, 45, 61],
              bola_extra: 7,
            },
          ],
          ModoSelecaoSena.MANUAL,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejeita item com menos de 6 números', () => {
      expect(() =>
        service.validarNumerosDaVenda(
          [
            {
              numeros: [3, 12, 24, 37, 45],
              bola_extra: 7,
            },
          ],
          ModoSelecaoSena.MANUAL,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejeita bola extra fora do intervalo ou repetida nos 6 números', () => {
      expect(() =>
        service.validarNumerosDaVenda(
          [
            {
              numeros: [1, 2, 3, 4, 5, 6],
              bola_extra: 61,
            },
          ],
          ModoSelecaoSena.MANUAL,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        service.validarNumerosDaVenda(
          [
            {
              numeros: [1, 2, 3, 4, 5, 6],
              bola_extra: 6,
            },
          ],
          ModoSelecaoSena.MANUAL,
        ),
      ).toThrow(BadRequestException);
    });
  });

  // ─── resolverCartelasDaVenda ────────────────────────────

  describe('resolverCartelasDaVenda', () => {
    it('usa números explícitos quando informados', () => {
      const cartelas = service.resolverCartelasDaVenda(
        [
          {
            numeros: [3, 12, 24, 37, 45, 58],
            bola_extra: 7,
          },
        ],
        ModoSelecaoSena.MANUAL,
        undefined,
        null,
      );
      expect(cartelas).toHaveLength(1);
      expect(cartelas[0].numeros).toEqual([3, 12, 24, 37, 45, 58]);
      expect(cartelas[0].bolaExtra).toBe(7);
    });

    it('exige o campo numeros', () => {
      expect(() =>
        service.resolverCartelasDaVenda(
          undefined,
          ModoSelecaoSena.MANUAL,
          undefined,
          null,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        service.resolverCartelasDaVenda(
          [],
          ModoSelecaoSena.MANUAL,
          undefined,
          null,
        ),
      ).toThrow(BadRequestException);
    });

    it('valida quantidade esperada por combo ou quantidade', () => {
      const itens = [
        {
          numeros: [3, 12, 24, 37, 45, 58],
          bola_extra: 7,
        },
      ];

      expect(() =>
        service.resolverCartelasDaVenda(
          itens,
          ModoSelecaoSena.MANUAL,
          undefined,
          2,
        ),
      ).toThrow(BadRequestException);
      expect(() =>
        service.resolverCartelasDaVenda(itens, ModoSelecaoSena.MANUAL, 2, null),
      ).toThrow(BadRequestException);
      expect(
        service.resolverCartelasDaVenda(
          itens,
          ModoSelecaoSena.MANUAL,
          undefined,
          1,
        ),
      ).toHaveLength(1);
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
