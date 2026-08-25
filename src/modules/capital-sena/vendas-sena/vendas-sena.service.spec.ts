import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  ModoSelecaoSena,
  Prisma,
  StatusEdicaoSena,
  StatusVendaSena,
} from '@prisma/client';
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
  buscarClientePorIdParaCompra(
    clienteId: string,
    vendedorId?: string,
    distribuidorId?: string,
  ): Promise<unknown>;
  buscarOuCriarClientePorDto(dto: {
    cpf?: string;
    nome?: string;
    telefone?: string;
    email?: string;
  }): Promise<unknown>;
  validarDadosClienteParaPagamento(cliente: {
    id: string;
    cpf: string;
    nome: string;
    telefone: string;
    email: string | null;
    dataNascimento: Date | null;
  }): {
    id: string;
    cpf: string;
    nome: string;
    telefone: string;
    email?: string;
  };
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
    distribuidor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
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

    it('cria cliente Sena sem data de nascimento informada', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);
      mockPrisma.cliente.create.mockResolvedValue({ id: 'cliente-novo' });

      await expect(
        service.buscarOuCriarCliente(
          '12345678900',
          'Cliente Sem Data',
          '(11) 99999-9999',
          undefined,
          'sem-data@email.com',
        ),
      ).resolves.toMatchObject({ id: 'cliente-novo' });

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dataNascimento: null }),
        }),
      );
    });
  });

  describe('clienteId na compra', () => {
    it('busca cliente por id para compra Sena e atualiza origem quando vendedor informado', async () => {
      const cliente = {
        id: 'cliente-1',
        cpf: '06790319107',
        nome: 'Jair Rodrigues',
        telefone: '(92) 99999-9999',
        email: 'jair@email.com',
        dataNascimento: new Date('1991-05-01T00:00:00.000Z'),
      };
      mockPrisma.vendedor.findUnique.mockResolvedValueOnce({
        id: 'vendedor-1',
        distribuidorId: 'distribuidor-1',
      });
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(cliente);
      mockPrisma.cliente.update.mockResolvedValueOnce({
        ...cliente,
        vendedorId: 'vendedor-1',
        distribuidorId: 'distribuidor-1',
      });

      const result = await service.buscarClientePorIdParaCompra(
        'cliente-1',
        'vendedor-1',
      );

      expect(mockPrisma.cliente.findUnique).toHaveBeenCalledWith({
        where: { id: 'cliente-1' },
        select: {
          id: true,
          cpf: true,
          nome: true,
          telefone: true,
          email: true,
          dataNascimento: true,
        },
      });
      expect(mockPrisma.cliente.update).toHaveBeenCalledWith({
        where: { id: 'cliente-1' },
        data: {
          vendedorId: 'vendedor-1',
          distribuidorId: 'distribuidor-1',
        },
        select: {
          id: true,
          cpf: true,
          nome: true,
          telefone: true,
          email: true,
          dataNascimento: true,
        },
      });
      expect(result).toMatchObject({ id: 'cliente-1' });
    });

    // Mesma regra do Capital Prêmios: o checkout pede só nome, CPF e telefone,
    // então cadastro sem e-mail nao pode travar o pagamento — o gateway usa um
    // endereço padrão. Antes isso derrubava a compra com 400.
    it('permite pagar por clienteId sem e-mail cadastrado', () => {
      expect(
        service.validarDadosClienteParaPagamento({
          id: 'cliente-1',
          cpf: '06790319107',
          nome: 'Jair Rodrigues',
          telefone: '(92) 99999-9999',
          email: null,
          dataNascimento: new Date('1991-05-01T00:00:00.000Z'),
        }),
      ).toMatchObject({ id: 'cliente-1', email: undefined });
    });

    // O obrigatorio passou a ser telefone (nao mais e-mail), igual ao
    // LojaPublicaService do Capital Premios.
    it('exige cpf, nome e telefone quando nao vem clienteId', async () => {
      await expect(
        service.buscarOuCriarClientePorDto({
          cpf: '06790319107',
          nome: 'Jair Rodrigues',
        }),
      ).rejects.toThrow('dados completos do cliente');
    });

    it('aceita cadastro novo sem e-mail, com cpf, nome e telefone', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
      mockPrisma.cliente.create.mockResolvedValueOnce({
        id: 'cliente-novo',
        cpf: '06790319107',
        nome: 'Jair Rodrigues',
        telefone: '(92) 99999-9999',
        email: null,
        dataNascimento: null,
      });

      const result = await service.buscarOuCriarClientePorDto({
        cpf: '06790319107',
        nome: 'Jair Rodrigues',
        telefone: '(92) 99999-9999',
      });

      expect(result).toMatchObject({ id: 'cliente-novo', email: null });
    });

    it('permite pagar por clienteId sem data de nascimento cadastrada', () => {
      expect(
        service.validarDadosClienteParaPagamento({
          id: 'cliente-1',
          cpf: '067.903.191-07',
          nome: 'Jair Rodrigues',
          telefone: '(92) 99999-9999',
          email: 'jair@email.com',
          dataNascimento: null,
        }),
      ).toMatchObject({ id: 'cliente-1', cpf: '06790319107' });
    });

    it('ainda bloqueia menor de idade quando a data está cadastrada', () => {
      const hoje = new Date();
      const menor = new Date(
        Date.UTC(hoje.getUTCFullYear() - 15, hoje.getUTCMonth(), 1),
      );

      expect(() =>
        service.validarDadosClienteParaPagamento({
          id: 'cliente-1',
          cpf: '06790319107',
          nome: 'Jair Rodrigues',
          telefone: '(92) 99999-9999',
          email: 'jair@email.com',
          dataNascimento: menor,
        }),
      ).toThrow('Produto proibido para menores de 18 anos');
    });
  });
  // ─── distribuidor na resposta ────────────────────────────
  //
  // VendaSena não tem relação `distribuidor` no Prisma, só o escalar
  // distribuidorId. Sem o anexo manual a chave some da resposta e o painel
  // admin fica sem o distribuidor da venda.

  describe('distribuidor na resposta', () => {
    // ServicePrivado colapsa para `never` (membros privados em conflito);
    // os métodos públicos são chamados pelo tipo real do service.
    const servicePublico = () => service as unknown as VendasSenaService;

    const DISTRIBUIDOR = {
      id: 'dist-1',
      codigo: 1,
      nome: 'Distribuidora Norte',
      email: 'distribuidor@capitalpremios.com',
      telefone: '(11) 99000-0001',
    };

    const vendaBase = (distribuidorId: string | null) => ({
      id: 'venda-sena-1',
      edicaoSenaId: 'edicao-1',
      clienteId: 'cliente-1',
      vendedorId: 'vendedor-1',
      distribuidorId,
      comboSenaId: null,
      quantidade: 1,
      total: new Prisma.Decimal(5),
      status: StatusVendaSena.APROVADO,
      tipoPagamento: 'PIX',
      gatewayId: null,
      createdAt: new Date(),
      edicaoSena: null,
      cliente: null,
      vendedor: null,
      cartelas: [],
    });

    it('anexa o distribuidor no findOne', async () => {
      mockPrisma.vendaSena.findUnique.mockResolvedValue(vendaBase('dist-1'));
      mockPrisma.distribuidor.findUnique.mockResolvedValue(DISTRIBUIDOR);

      const venda = (await servicePublico().findOne('venda-sena-1')) as Record<
        string,
        unknown
      >;

      expect(venda.distribuidor).toEqual(DISTRIBUIDOR);
      expect(mockPrisma.distribuidor.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dist-1' } }),
      );
    });

    it('retorna distribuidor null quando a venda não tem vínculo', async () => {
      mockPrisma.vendaSena.findUnique.mockResolvedValue(vendaBase(null));

      const venda = (await servicePublico().findOne('venda-sena-1')) as Record<
        string,
        unknown
      >;

      expect('distribuidor' in venda).toBe(true);
      expect(venda.distribuidor).toBeNull();
      expect(mockPrisma.distribuidor.findUnique).not.toHaveBeenCalled();
    });

    it('anexa o distribuidor no findAll sem consultar o mesmo id duas vezes', async () => {
      mockPrisma.vendaSena.findMany.mockResolvedValue([
        vendaBase('dist-1'),
        { ...vendaBase('dist-1'), id: 'venda-sena-2' },
        { ...vendaBase(null), id: 'venda-sena-3' },
      ]);
      mockPrisma.vendaSena.count.mockResolvedValue(3);
      mockPrisma.distribuidor.findMany.mockResolvedValue([DISTRIBUIDOR]);

      const resposta = (await servicePublico().findAll({})) as unknown as {
        data: Record<string, unknown>[];
      };

      expect(resposta.data[0].distribuidor).toEqual(DISTRIBUIDOR);
      expect(resposta.data[1].distribuidor).toEqual(DISTRIBUIDOR);
      expect(resposta.data[2].distribuidor).toBeNull();
      expect(mockPrisma.distribuidor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['dist-1'] } } }),
      );
    });
  });
  // ─── Vinculo do cliente na compra Sena ───────────────────────────────
  describe('buscarClientePorIdParaCompra — vinculo do cliente', () => {
    // Mesmo motivo do bloco acima: ServicePrivado colapsa para `never`. Como
    // este metodo e privado, alcancamos ele por um alias tipado local.
    const buscarCliente = (
      clienteId: string,
      vendedorId?: string,
      distribuidorId?: string,
    ): Promise<unknown> =>
      (
        service as unknown as {
          buscarClientePorIdParaCompra(
            clienteId: string,
            vendedorId?: string,
            distribuidorId?: string,
          ): Promise<unknown>;
        }
      ).buscarClientePorIdParaCompra(clienteId, vendedorId, distribuidorId);

    const CLIENTE = {
      id: 'cliente-1',
      cpf: '12345678901',
      nome: 'Fulano',
      telefone: '64999999999',
      email: null,
      dataNascimento: null,
    };

    beforeEach(() => {
      mockPrisma.cliente.findUnique.mockResolvedValue(CLIENTE);
      mockPrisma.cliente.update.mockResolvedValue(CLIENTE);
    });

    it('deriva o distribuidor a partir do vendedor', async () => {
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        distribuidorId: 'distribuidor-do-vendedor',
      });

      await buscarCliente('cliente-1', 'vendedor-1');

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            vendedorId: 'vendedor-1',
            distribuidorId: 'distribuidor-do-vendedor',
          },
        }),
      );
    });

    it('rejeita vendedor inexistente em vez de gravar par que a CHECK recusa', async () => {
      mockPrisma.vendedor.findUnique.mockResolvedValue(null);

      await expect(
        buscarCliente('cliente-1', 'vendedor-fantasma'),
      ).rejects.toThrow('Vendedor não encontrado');

      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
    });

    it('mantem o vinculo atual quando nada e informado', async () => {
      await buscarCliente('cliente-1');

      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
    });
  });

  // ─── REGRESSAO: seller_id invalido precisa continuar falhando ────────
  describe('create — validacao do seller_id', () => {
    const servicePublico = () => service as unknown as VendasSenaService;

    beforeEach(() => {
      mockPrisma.edicaoSena.findUnique.mockResolvedValue({
        id: 'edicao-1',
        numero: '001',
        status: StatusEdicaoSena.ATIVA,
        dataEncerramento: new Date('2099-01-01'),
        valorCartela: new Prisma.Decimal(10),
        combos: [],
      });
    });

    it('rejeita seller_id inexistente mesmo quando ha vinculo explicito', async () => {
      // O vinculo explicito vence, mas isso nao pode fazer o seller_id
      // invalido passar despercebido.
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      mockPrisma.vendedor.findUnique.mockResolvedValue(null);
      mockPrisma.distribuidor.findUnique.mockResolvedValue(null);

      await expect(
        servicePublico().create({
          edicaoSenaId: 'edicao-1',
          seller_id: 'seller-inexistente',
          vendedorId: 'vendedor-1',
          numeros: [{ numeros: [1, 2, 3, 4, 5, 6], bola_extra: 7 }],
        } as never),
      ).rejects.toThrow('Seller não encontrado');
    });
  });
});
