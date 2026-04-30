import { formatDateTimeForInput } from '../../common/utils/business-date-time.util';
import { serializarEstadoManutencao } from './edicao-manutencao.util';
import {
  calcularTotalBilhetesDosDetalhes,
  expandirSetoresDosDetalhes,
  obterDetalhesComFallback,
  obterQuantidadeChances,
} from './edicoes-range.util';
import { EdicaoComRelacoes } from './edicoes.types';

export function serializarEdicao(
  edicao: EdicaoComRelacoes,
  businessTimeZone: string,
) {
  const detalhesNormalizados = obterDetalhesComFallback(edicao).map(
    (detalhe, index) => ({
      ...detalhe,
      ordemConfiguracao: index,
      indiceRange:
        'indiceRange' in detalhe && typeof detalhe.indiceRange === 'number'
          ? detalhe.indiceRange
          : index + 1,
    }),
  );

  const detalhesConfigurados = detalhesNormalizados.map((detalhe) => {
    const setores = expandirSetoresDosDetalhes([detalhe]);
    const primeiroSetor = setores[0];
    const segundoSetor = setores[1];
    const quantidadeBilhetes = calcularTotalBilhetesDosDetalhes([detalhe]);
    const quantidadeCombos = primeiroSetor?.quantidadeCombos ?? 0n;

    return {
      origemParticipacao: detalhe.origemParticipacao,
      indiceRange: detalhe.indiceRange,
      tipoCartelaBase: detalhe.tipoCartela,
      quantidadeCombos: quantidadeCombos.toString(),
      quantidadeBilhetes: quantidadeBilhetes.toString(),
      passoEntreChances: primeiroSetor && segundoSetor
        ? (segundoSetor.rangeInicio - primeiroSetor.rangeInicio).toString()
        : '0',
      rangeTotalInicio: primeiroSetor?.rangeTotalInicio.toString() ?? '0',
      rangeTotalFinal: primeiroSetor?.rangeTotalFinal.toString() ?? '0',
      legado: edicao.detalhes.length === 0,
      setores: setores.map((setor) => ({
        indiceChance: setor.indiceChance,
        rangeInicio: setor.rangeInicio.toString(),
        rangeFinal: setor.rangeFinal.toString(),
      })),
      rangeConfigurado: {
        rangeInicio: detalhe.rangeInicio.toString(),
        rangeFinal: detalhe.rangeFinal.toString(),
        intervalo: (detalhe.rangeFinal - detalhe.rangeInicio + 1n).toString(),
      },
    };
  });

  const combos = edicao.combos.map((combo) => ({
    ...combo,
    quantidadeCartelas: obterQuantidadeChances(combo.tipoCartela),
    quantidadeChances: obterQuantidadeChances(combo.tipoCartela),
    preco: combo.preco.toString(),
  }));

  return {
    ...edicao,
    rangeInicio: edicao.rangeInicio.toString(),
    rangeFinal: edicao.rangeFinal.toString(),
    valorCartela: edicao.valorCartela.toString(),
    ...serializarEstadoManutencao(edicao),
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
    detalhes: detalhesConfigurados,
    combos,
    premios: edicao.premios.map((premio) => ({
      ...premio,
      valor: premio.valor.toString(),
    })),
  };
}
