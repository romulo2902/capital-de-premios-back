import { TipoCartela } from '@prisma/client';
import { obterQuantidadeChances } from '../edicoes/edicoes-range.util';

export function calcularQuantidadeCartelasDaVenda(params: {
  quantidade: number;
  tipoCartela?: TipoCartela | null;
  quantidadeBilhetes?: number | null;
}): number {
  if (
    params.quantidadeBilhetes !== undefined &&
    params.quantidadeBilhetes !== null
  ) {
    return params.quantidadeBilhetes;
  }

  const multiplicador = params.tipoCartela
    ? obterQuantidadeChances(params.tipoCartela)
    : 1;

  return params.quantidade * multiplicador;
}
