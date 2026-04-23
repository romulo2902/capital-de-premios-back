import { OrigemParticipacao, Prisma, TipoCartela } from '@prisma/client';
import type { UploadFile } from '../../common/types/upload-file.type';

export type EdicaoComRelacoes = Prisma.EdicaoGetPayload<{
  include: {
    detalhes: true;
    combos: true;
    premios: true;
  };
}>;

export interface DetalheRangeNormalizado {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  rangeInicio: bigint;
  rangeFinal: bigint;
  indiceRange: number;
  preco?: string;
  ordemConfiguracao?: number;
}

export interface ArquivoImagemUpload extends UploadFile {}
