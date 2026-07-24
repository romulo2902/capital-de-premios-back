import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
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
