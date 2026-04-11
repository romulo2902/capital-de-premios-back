import { formatDateTimeForInput } from '../../common/utils/business-date-time.util';
import {
  calcularPassoEntreChancesDoDetalhe,
  calcularQuantidadeCombosDoDetalhe,
  calcularTotalBilhetesDoDetalhe,
  expandirSetoresDoDetalhe,
  obterDetalhesComFallback,
  obterQuantidadeChances,
} from './edicoes-range.util';
import { EdicaoComRelacoes } from './edicoes.types';

export function serializarEdicao(
  edicao: EdicaoComRelacoes,
  businessTimeZone: string,
) {
  const detalhes = obterDetalhesComFallback(edicao).map((detalhe) => ({
    ...detalhe,
    rangeInicio: detalhe.rangeInicio.toString(),
    rangeFinal: detalhe.rangeFinal.toString(),
    intervalo: (
      detalhe.rangeFinal -
      detalhe.rangeInicio +
      BigInt(1)
    ).toString(),
    quantidadeChances: obterQuantidadeChances(detalhe.tipoCartela),
    quantidadeCombos: calcularQuantidadeCombosDoDetalhe(detalhe).toString(),
    quantidadeBilhetes: calcularTotalBilhetesDoDetalhe(detalhe).toString(),
    passoEntreChances: calcularPassoEntreChancesDoDetalhe(detalhe).toString(),
    legado: edicao.detalhes.length === 0,
    preco:
      'preco' in detalhe && detalhe.preco
        ? detalhe.preco.toString()
        : edicao.valorCartela.toString(),
    setores: expandirSetoresDoDetalhe(detalhe).map((setor) => ({
      indiceChance: setor.indiceChance,
      rangeInicio: setor.rangeInicio.toString(),
      rangeFinal: setor.rangeFinal.toString(),
    })),
  }));

  return {
    ...edicao,
    rangeInicio: edicao.rangeInicio.toString(),
    rangeFinal: edicao.rangeFinal.toString(),
    valorCartela: edicao.valorCartela.toString(),
    qtdNumerosCartela: edicao.qtdNumerosCartela,
    dataSorteioLocal: formatDateTimeForInput(
      edicao.dataSorteio,
      businessTimeZone,
    ),
    dataEncerramentoLocal: formatDateTimeForInput(
      edicao.dataEncerramento,
      businessTimeZone,
    ),
    timezone: businessTimeZone,
    detalhes,
    premios: edicao.premios.map((premio) => ({
      ...premio,
      valor: premio.valor.toString(),
    })),
  };
}
