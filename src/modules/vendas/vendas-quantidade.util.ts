import { TipoCartela } from '@prisma/client';
import { obterQuantidadeCartelas } from '../edicoes/edicoes-range.util';

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
    ? obterQuantidadeCartelas(params.tipoCartela)
    : 1;

  return params.quantidade * multiplicador;
}
