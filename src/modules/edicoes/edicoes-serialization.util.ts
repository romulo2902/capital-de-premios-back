import { formatDateTimeForInput } from '../../common/utils/business-date-time.util';
import {
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
    intervalo: (detalhe.rangeFinal - detalhe.rangeInicio + BigInt(1)).toString(),
    quantidadeChances: obterQuantidadeChances(detalhe.tipoCartela),
    legado: edicao.detalhes.length === 0,
  }));

  return {
    ...edicao,
    rangeInicio: edicao.rangeInicio.toString(),
    rangeFinal: edicao.rangeFinal.toString(),
    valorCartela: edicao.valorCartela.toString(),
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
