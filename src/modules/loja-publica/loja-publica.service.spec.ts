import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
  StatusVenda,
  TipoCartela,
} from '@prisma/client';
import { LojaPublicaService } from './loja-publica.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VendasService } from '../vendas/vendas.service';
import { ConteudoService } from '../conteudo/conteudo.service';
import { PaymentGatewayFactory } from '../pagamentos/gateways/payment-gateway.factory';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Regras de range validadas aqui (modelo novo: o range vive dentro do combo).
 *
 * Um combo de N chances NÃO vende "as cartelas 1..N" de ranges separados:
 * ele fatia o PRÓPRIO range em N setores deslocados de 1, e o comprador leva
 * um bilhete de cada setor. Estes testes travam esse contrato, que é o que
 * a loja consome via GET /loja/edicao-ativa.
 */
describe('LojaPublicaService — ranges e setores dos combos', () => {
  let service: LojaPublicaService;

  const mockPrisma = {
    edicao: {
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LojaPublicaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VendasService, useValue: {} },
        { provide: ConteudoService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PaymentGatewayFactory, useValue: {} },
        {
          provide: RedisService,
          useValue: { isConfigured: () => false, client: null },
        },
      ],
    }).compile();

    service = module.get<LojaPublicaService>(LojaPublicaService);
  });

  function montarCombo(params: {
    id: string;
    tipoCartela: TipoCartela;
    rangeInicio: bigint;
    rangeFinal: bigint;
    preco?: string;
  }) {
    return {
      id: params.id,
      origemParticipacao: OrigemParticipacao.DIGITAL,
      tipoCartela: params.tipoCartela,
      preco: new Prisma.Decimal(params.preco ?? '10.00'),
      rangeInicio: params.rangeInicio,
      rangeFinal: params.rangeFinal,
    };
  }

  function mockarEdicaoComCombos(
    combos: ReturnType<typeof montarCombo>[],
  ): void {
    mockPrisma.edicao.findFirst.mockResolvedValue({
      id: 'edicao-1',
      numero: 'TESTE-001',
      dataSorteio: new Date('2026-12-01T20:00:00Z'),
      dataEncerramento: new Date('2026-12-01T19:00:00Z'),
      frase: 'frase',
      imagemUrl: null,
      status: StatusEdicao.ATIVA,
      qtdNumerosCartela: 6,
      manutencaoAtiva: false,
      manutencaoMensagem: null,
      premios: [],
      combos,
    });
  }

  async function obterOpcoes() {
    const resposta = await service.getHome();
    return resposta.data!.opcoes;
  }

  it('combo de 1 chance gera 1 setor cobrindo o range inteiro', async () => {
    mockarEdicaoComCombos([
      montarCombo({
        id: 'c1',
        tipoCartela: TipoCartela.UMA_CHANCE,
        rangeInicio: 990000n,
        rangeFinal: 991000n,
      }),
    ]);

    const [opcao] = await obterOpcoes();

    expect(opcao.setores).toHaveLength(1);
    expect(opcao.setores[0]).toMatchObject({
      indiceCartela: 1,
      rangeInicio: '990000',
      rangeFinal: '991000',
    });
  });

  it('combo de 2 chances gera 2 setores deslocados de 1 dentro do proprio range', async () => {
    mockarEdicaoComCombos([
      montarCombo({
        id: 'c2',
        tipoCartela: TipoCartela.DUAS_CHANCES,
        rangeInicio: 990000n,
        rangeFinal: 991000n,
      }),
    ]);

    const [opcao] = await obterOpcoes();

    expect(opcao.quantidadeCartelas).toBe(2);
    expect(opcao.setores).toEqual([
      { indiceCartela: 1, rangeInicio: '990000', rangeFinal: '990999' },
      { indiceCartela: 2, rangeInicio: '990001', rangeFinal: '991000' },
    ]);
  });

  it('combo de 6 chances gera 6 setores, um por chance', async () => {
    mockarEdicaoComCombos([
      montarCombo({
        id: 'c6',
        tipoCartela: TipoCartela.SEIS_CHANCES,
        rangeInicio: 992000n,
        rangeFinal: 993000n,
      }),
    ]);

    const [opcao] = await obterOpcoes();

    expect(opcao.quantidadeCartelas).toBe(6);
    expect(opcao.setores).toHaveLength(6);
    expect(opcao.setores[0]).toMatchObject({
      rangeInicio: '992000',
      rangeFinal: '992995',
    });
    expect(opcao.setores[5]).toMatchObject({
      rangeInicio: '992005',
      rangeFinal: '993000',
    });
  });

  // Regressao do modelo antigo: os setores NUNCA podem sair do range do combo.
  it.each([
    [TipoCartela.DUAS_CHANCES, 2],
    [TipoCartela.SEIS_CHANCES, 6],
    [TipoCartela.DOZE_CHANCES, 12],
  ])(
    'setores de %s ficam contidos no range do combo',
    async (tipoCartela, esperado) => {
      const inicio = 950000n;
      const fim = 951000n;
      mockarEdicaoComCombos([
        montarCombo({ id: 'c', tipoCartela, rangeInicio: inicio, rangeFinal: fim }),
      ]);

      const [opcao] = await obterOpcoes();

      expect(opcao.setores).toHaveLength(esperado);
      for (const setor of opcao.setores) {
        expect(BigInt(setor.rangeInicio)).toBeGreaterThanOrEqual(inicio);
        expect(BigInt(setor.rangeFinal)).toBeLessThanOrEqual(fim);
        expect(BigInt(setor.rangeInicio)).toBeLessThanOrEqual(
          BigInt(setor.rangeFinal),
        );
      }
    },
  );

  it('todos os setores tem o mesmo tamanho e passo 1 entre eles', async () => {
    mockarEdicaoComCombos([
      montarCombo({
        id: 'c6',
        tipoCartela: TipoCartela.SEIS_CHANCES,
        rangeInicio: 992000n,
        rangeFinal: 993000n,
      }),
    ]);

    const [opcao] = await obterOpcoes();

    const tamanhos = opcao.setores.map(
      (s) => BigInt(s.rangeFinal) - BigInt(s.rangeInicio) + 1n,
    );
    expect(new Set(tamanhos.map(String)).size).toBe(1);
    // tamanho do setor = total do range - (N - 1)
    expect(tamanhos[0]).toBe(1001n - 5n);
    expect(opcao.passoEntreCartelas).toBe('1');
  });

  it('setores sao distintos entre si (garante N bilhetes diferentes)', async () => {
    mockarEdicaoComCombos([
      montarCombo({
        id: 'c6',
        tipoCartela: TipoCartela.SEIS_CHANCES,
        rangeInicio: 992000n,
        rangeFinal: 993000n,
      }),
    ]);

    const [opcao] = await obterOpcoes();

    const chaves = opcao.setores.map((s) => `${s.rangeInicio}-${s.rangeFinal}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('combos diferentes nao vazam range um do outro', async () => {
    mockarEdicaoComCombos([
      montarCombo({
        id: 'c2',
        tipoCartela: TipoCartela.DUAS_CHANCES,
        rangeInicio: 990000n,
        rangeFinal: 991000n,
      }),
      montarCombo({
        id: 'c6',
        tipoCartela: TipoCartela.SEIS_CHANCES,
        rangeInicio: 992000n,
        rangeFinal: 993000n,
      }),
    ]);

    const opcoes = await obterOpcoes();

    expect(opcoes).toHaveLength(2);
    for (const setor of opcoes[0].setores) {
      expect(BigInt(setor.rangeFinal)).toBeLessThan(992000n);
    }
    for (const setor of opcoes[1].setores) {
      expect(BigInt(setor.rangeInicio)).toBeGreaterThanOrEqual(992000n);
    }
  });

  it('expoe rangeTotal do combo, nao do setor', async () => {
    mockarEdicaoComCombos([
      montarCombo({
        id: 'c6',
        tipoCartela: TipoCartela.SEIS_CHANCES,
        rangeInicio: 992000n,
        rangeFinal: 993000n,
      }),
    ]);

    const [opcao] = await obterOpcoes();

    expect(opcao.rangeTotalInicio).toBe('992000');
    expect(opcao.rangeTotalFinal).toBe('993000');
  });

  it('ignora combos que nao sao DIGITAL', async () => {
    mockarEdicaoComCombos([
      {
        ...montarCombo({
          id: 'fisico',
          tipoCartela: TipoCartela.DUAS_CHANCES,
          rangeInicio: 990000n,
          rangeFinal: 991000n,
        }),
        origemParticipacao: OrigemParticipacao.FISICO,
      },
    ]);

    const opcoes = await obterOpcoes();

    expect(opcoes).toHaveLength(0);
  });
});

/**
 * A loja usa GET /loja/resultados para montar a secao "Sorteios Anteriores",
 * que exibe a imagem promocional de cada edicao finalizada. Sem imagemUrl na
 * resposta o carrossel cai no placeholder para todos os cards.
 */
describe('LojaPublicaService — getResultados', () => {
  let service: LojaPublicaService;

  const mockPrisma = {
    edicao: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LojaPublicaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VendasService, useValue: {} },
        { provide: ConteudoService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PaymentGatewayFactory, useValue: {} },
        {
          provide: RedisService,
          useValue: { isConfigured: () => false, client: null },
        },
      ],
    }).compile();

    service = module.get<LojaPublicaService>(LojaPublicaService);
  });

  it('expoe imagemUrl, frase e numeros apurados de cada edicao finalizada', async () => {
    mockPrisma.edicao.findMany.mockResolvedValue([
      {
        id: 'edicao-1',
        numero: '001',
        dataSorteio: new Date('2026-07-26T20:00:00Z'),
        imagemUrl: 'https://cdn.exemplo.com/edicao-001.png',
        frase: 'Jeep Renegade',
        resultado: { numerosApurados: ['12', '34'] },
      },
    ]);

    const resposta = await service.getResultados();

    expect(resposta.data).toEqual([
      {
        id: 'edicao-1',
        numero: '001',
        dataSorteio: new Date('2026-07-26T20:00:00Z'),
        imagemUrl: 'https://cdn.exemplo.com/edicao-001.png',
        frase: 'Jeep Renegade',
        resultado: ['12', '34'],
      },
    ]);
  });

  it('mantem imagemUrl e frase nulos quando a edicao nao os tem', async () => {
    mockPrisma.edicao.findMany.mockResolvedValue([
      {
        id: 'edicao-2',
        numero: '002',
        dataSorteio: new Date('2026-06-14T20:00:00Z'),
        imagemUrl: null,
        frase: null,
        resultado: null,
      },
    ]);

    const resposta = await service.getResultados();

    expect(resposta.data[0]).toMatchObject({
      imagemUrl: null,
      frase: null,
      resultado: null,
    });
  });

  it('busca apenas edicoes FINALIZADA, das mais recentes para as mais antigas', async () => {
    mockPrisma.edicao.findMany.mockResolvedValue([]);

    await service.getResultados();

    expect(mockPrisma.edicao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: StatusEdicao.FINALIZADA },
        orderBy: { dataSorteio: 'desc' },
      }),
    );
  });
});

/**
 * A loja usa GET /loja/ganhadores para a secao "Hall da Fama".
 *
 * Dois contratos importantes travados aqui:
 *
 * 1. O nome do cliente NUNCA sai completo — a pagina e publica.
 * 2. O rateio vem de contar bilhetes ganhadores por premio, e nao de
 *    `Premio.ganhadorBilheteId` (single-valued). Hoje o sorteio registra um
 *    ganhador por premio, mas se passar a registrar empates o rateio ja
 *    funciona sem alteracao no service.
 */
describe('LojaPublicaService — getGanhadores', () => {
  let service: LojaPublicaService;

  const mockPrisma = {
    bilhete: {
      findMany: jest.fn(),
    },
    premio: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LojaPublicaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VendasService, useValue: {} },
        { provide: ConteudoService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PaymentGatewayFactory, useValue: {} },
        {
          provide: RedisService,
          useValue: { isConfigured: () => false, client: null },
        },
      ],
    }).compile();

    service = module.get<LojaPublicaService>(LojaPublicaService);
  });

  function montarBilhete(params: {
    id: string;
    premioId: string;
    clienteNome: string;
    cidade?: string | null;
    estado?: string | null;
    vendedorNome?: string | null;
    edicaoNumero?: string;
    dataSorteio?: Date;
  }) {
    // `??` nao serve aqui: os testes de campo nulo passam null de proposito, e
    // o default engoliria justamente o caso sob teste.
    return {
      id: params.id,
      premioId: params.premioId,
      ganhador: true,
      venda: {
        cliente: {
          nome: params.clienteNome,
          cidade: 'cidade' in params ? params.cidade : 'VALPARAISO',
          estado: 'estado' in params ? params.estado : 'GO',
        },
        vendedor:
          'vendedorNome' in params
            ? params.vendedorNome === null
              ? null
              : { nome: params.vendedorNome }
            : { nome: 'ADEGA BEBIDAS PONTO NOVO' },
        edicao: {
          numero: params.edicaoNumero ?? '001',
          dataSorteio: params.dataSorteio ?? new Date('2026-07-26T20:00:00Z'),
        },
      },
    };
  }

  it('abrevia o sobrenome do ganhador', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'bilhete-1',
        premioId: 'premio-1',
        clienteNome: 'JANIELSON BARBOSA COSTA',
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-1', ordem: 1, descricao: '1º Prêmio', valor: 3000 },
    ]);

    const resposta = await service.getGanhadores();

    expect(resposta.data[0].nome).toBe('JANIELSON B C');
  });

  it('mantem nome unico sem sobrenome intacto', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'bilhete-1',
        premioId: 'premio-1',
        clienteNome: 'MADONNA',
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-1', ordem: 1, descricao: '1º Prêmio', valor: 3000 },
    ]);

    const resposta = await service.getGanhadores();

    expect(resposta.data[0].nome).toBe('MADONNA');
  });

  it('rateia o valor quando um premio tem varios bilhetes ganhadores', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'bilhete-1',
        premioId: 'premio-3',
        clienteNome: 'MARCUS A B',
      }),
      montarBilhete({
        id: 'bilhete-2',
        premioId: 'premio-3',
        clienteNome: 'EDUARDO M S',
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-3', ordem: 3, descricao: '3º Prêmio', valor: 7000 },
    ]);

    const resposta = await service.getGanhadores();

    expect(resposta.data).toHaveLength(2);
    for (const ganhador of resposta.data) {
      expect(ganhador.totalGanhadores).toBe(2);
      expect(ganhador.valorPremio).toBe(7000);
      expect(ganhador.valorPorGanhador).toBe(3500);
    }
  });

  it('nao rateia quando o premio tem um unico ganhador', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'bilhete-1',
        premioId: 'premio-1',
        clienteNome: 'VICENTE DE PAULA',
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-1', ordem: 1, descricao: '1º Prêmio', valor: 5000 },
    ]);

    const resposta = await service.getGanhadores();

    expect(resposta.data[0]).toMatchObject({
      totalGanhadores: 1,
      valorPremio: 5000,
      valorPorGanhador: 5000,
    });
  });

  it('propaga cidade, estado e vendedor nulos sem quebrar', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'bilhete-1',
        premioId: 'premio-1',
        clienteNome: 'SEM ENDERECO',
        cidade: null,
        estado: null,
        vendedorNome: null,
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-1', ordem: 1, descricao: '1º Prêmio', valor: 1000 },
    ]);

    const resposta = await service.getGanhadores();

    expect(resposta.data[0]).toMatchObject({
      cidade: null,
      estado: null,
      vendedorNome: null,
    });
  });

  it('ordena por data do sorteio desc e desempata pela ordem do premio', async () => {
    const antiga = new Date('2026-06-14T20:00:00Z');
    const recente = new Date('2026-07-26T20:00:00Z');

    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'b-antiga',
        premioId: 'premio-antigo',
        clienteNome: 'ANTIGO A',
        dataSorteio: antiga,
        edicaoNumero: '002',
      }),
      montarBilhete({
        id: 'b-recente-2',
        premioId: 'premio-2',
        clienteNome: 'SEGUNDO S',
        dataSorteio: recente,
      }),
      montarBilhete({
        id: 'b-recente-1',
        premioId: 'premio-1',
        clienteNome: 'PRIMEIRO P',
        dataSorteio: recente,
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-antigo', ordem: 1, descricao: '1º', valor: 100 },
      { id: 'premio-2', ordem: 2, descricao: '2º', valor: 200 },
      { id: 'premio-1', ordem: 1, descricao: '1º', valor: 300 },
    ]);

    const resposta = await service.getGanhadores();

    expect(resposta.data.map((g) => g.id)).toEqual([
      'b-recente-1',
      'b-recente-2',
      'b-antiga',
    ]);
  });

  it('busca apenas bilhetes ganhadores de vendas aprovadas em edicoes finalizadas', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([]);

    const resposta = await service.getGanhadores();

    expect(resposta.data).toEqual([]);
    expect(mockPrisma.bilhete.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ganhador: true,
          premioId: { not: null },
          venda: {
            status: StatusVenda.APROVADO,
            edicao: { status: StatusEdicao.FINALIZADA },
          },
        }),
      }),
    );
    // Sem bilhetes, nem precisa ir buscar premio.
    expect(mockPrisma.premio.findMany).not.toHaveBeenCalled();
  });

  it('descarta bilhete cujo premio nao existe mais', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'bilhete-orfao',
        premioId: 'premio-removido',
        clienteNome: 'ORFAO O',
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([]);

    const resposta = await service.getGanhadores();

    expect(resposta.data).toEqual([]);
  });

  it('entrega dataSorteio em ISO, para o payload nao mudar vindo do cache', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      montarBilhete({
        id: 'bilhete-1',
        premioId: 'premio-1',
        clienteNome: 'ISO T',
        dataSorteio: new Date('2026-07-26T20:00:00Z'),
      }),
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-1', ordem: 1, descricao: '1º Prêmio', valor: 3000 },
    ]);

    const resposta = await service.getGanhadores();

    expect(resposta.data[0].dataSorteio).toBe('2026-07-26T20:00:00.000Z');
  });
});

/**
 * O Hall da Fama é público e sem auth: cada visita à landing bateria no banco.
 * O cache protege isso — mas nunca pode virar ponto de falha, então uma queda
 * do Redis tem que degradar para consulta direta em vez de derrubar o endpoint.
 */
describe('LojaPublicaService — getGanhadores (cache)', () => {
  const mockPrisma = {
    bilhete: { findMany: jest.fn() },
    premio: { findMany: jest.fn() },
  };

  const mockRedisClient = {
    get: jest.fn(),
    setex: jest.fn(),
  };

  async function montarService(redisConfigurado: boolean) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LojaPublicaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VendasService, useValue: {} },
        { provide: ConteudoService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PaymentGatewayFactory, useValue: {} },
        {
          provide: RedisService,
          useValue: {
            isConfigured: () => redisConfigurado,
            client: redisConfigurado ? mockRedisClient : null,
          },
        },
      ],
    }).compile();

    return module.get<LojaPublicaService>(LojaPublicaService);
  }

  function mockarUmGanhador() {
    mockPrisma.bilhete.findMany.mockResolvedValue([
      {
        id: 'bilhete-1',
        premioId: 'premio-1',
        ganhador: true,
        venda: {
          cliente: { nome: 'CACHE T', cidade: 'BRASILIA', estado: 'DF' },
          vendedor: { nome: 'VENDEDOR' },
          edicao: {
            numero: '001',
            dataSorteio: new Date('2026-07-26T20:00:00Z'),
          },
        },
      },
    ]);
    mockPrisma.premio.findMany.mockResolvedValue([
      { id: 'premio-1', ordem: 1, descricao: '1º Prêmio', valor: 3000 },
    ]);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('grava o resultado no cache apos consultar o banco', async () => {
    const service = await montarService(true);
    mockRedisClient.get.mockResolvedValue(null);
    mockarUmGanhador();

    await service.getGanhadores();

    expect(mockRedisClient.setex).toHaveBeenCalledWith(
      'loja:ganhadores',
      300,
      expect.stringContaining('CACHE T'),
    );
  });

  it('serve do cache sem tocar no banco', async () => {
    const service = await montarService(true);
    mockRedisClient.get.mockResolvedValue(
      JSON.stringify([
        {
          id: 'bilhete-cacheado',
          nome: 'DO CACHE',
          cidade: null,
          estado: null,
          premioOrdem: 1,
          premioDescricao: '1º Prêmio',
          valorPremio: 3000,
          valorPorGanhador: 3000,
          totalGanhadores: 1,
          vendedorNome: null,
          edicaoNumero: '001',
          dataSorteio: '2026-07-26T20:00:00.000Z',
        },
      ]),
    );

    const resposta = await service.getGanhadores();

    expect(resposta.data[0].nome).toBe('DO CACHE');
    expect(mockPrisma.bilhete.findMany).not.toHaveBeenCalled();
  });

  it('cai para o banco quando a leitura do cache falha', async () => {
    const service = await montarService(true);
    mockRedisClient.get.mockRejectedValue(new Error('redis fora do ar'));
    mockarUmGanhador();

    const resposta = await service.getGanhadores();

    expect(resposta.data[0].nome).toBe('CACHE T');
    expect(mockPrisma.bilhete.findMany).toHaveBeenCalled();
  });

  it('responde normalmente quando a gravacao no cache falha', async () => {
    const service = await montarService(true);
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.setex.mockRejectedValue(new Error('redis fora do ar'));
    mockarUmGanhador();

    const resposta = await service.getGanhadores();

    expect(resposta.data[0].nome).toBe('CACHE T');
  });

  it('funciona sem Redis configurado', async () => {
    const service = await montarService(false);
    mockarUmGanhador();

    const resposta = await service.getGanhadores();

    expect(resposta.data[0].nome).toBe('CACHE T');
    expect(mockRedisClient.get).not.toHaveBeenCalled();
  });
});
