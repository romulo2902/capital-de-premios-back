import { Prisma, StatusEdicao, TipoCartela } from '@prisma/client';

export const EDICAO_INCLUDE = {
  detalhes: {
    orderBy: [
      { origemParticipacao: 'asc' },
      { tipoCartela: 'asc' },
      { rangeInicio: 'asc' },
    ],
  },
  premios: {
    orderBy: { ordem: 'asc' },
  },
} satisfies Prisma.EdicaoInclude;

export const STATUSS_EDICAO_EM_OPERACAO: StatusEdicao[] = [
  StatusEdicao.ATIVA,
  StatusEdicao.ENCERRADA,
  StatusEdicao.SORTEANDO,
];

export const QUANTIDADE_CHANCES_POR_TIPO_CARTELA: Record<TipoCartela, number> =
  {
    [TipoCartela.UMA_CHANCE]: 1,
    [TipoCartela.DUAS_CHANCES]: 2,
    [TipoCartela.TRES_CHANCES]: 3,
    [TipoCartela.QUATRO_CHANCES]: 4,
    [TipoCartela.CINCO_CHANCES]: 5,
    [TipoCartela.SEIS_CHANCES]: 6,
    [TipoCartela.SETE_CHANCES]: 7,
    [TipoCartela.OITO_CHANCES]: 8,
    [TipoCartela.NOVE_CHANCES]: 9,
    [TipoCartela.DEZ_CHANCES]: 10,
    [TipoCartela.ONZE_CHANCES]: 11,
    [TipoCartela.DOZE_CHANCES]: 12,
  };
