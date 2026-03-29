import { OrigemParticipacao, Prisma, TipoCartela } from '@prisma/client';

export type EdicaoComRelacoes = Prisma.EdicaoGetPayload<{
  include: {
    detalhes: true;
    premios: true;
  };
}>;

export interface DetalheRangeNormalizado {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  rangeInicio: bigint;
  rangeFinal: bigint;
}
