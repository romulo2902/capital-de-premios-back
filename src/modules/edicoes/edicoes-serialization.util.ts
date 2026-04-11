import { formatDateTimeForInput } from '../../common/utils/business-date-time.util';
import {
  agruparDetalhesPorOrigemETipoCartela,
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
      preco:
        'preco' in detalhe && detalhe.preco
          ? detalhe.preco.toString()
          : undefined,
    }),
  );

  const configuracoes = agruparDetalhesPorOrigemETipoCartela(
    detalhesNormalizados,
  ).map((grupo) => {
    const setores = expandirSetoresDosDetalhes(grupo.detalhes);
    const primeiroSetor = setores[0];
    const segundoSetor = setores[1];
    const quantidadeBilhetes = calcularTotalBilhetesDosDetalhes(grupo.detalhes);
    const quantidadeCombos = primeiroSetor?.quantidadeCombos ?? 0n;
    const precoConfigurado = grupo.detalhes.find((detalhe) => detalhe.preco)?.preco;

    return {
      origemParticipacao: grupo.origemParticipacao,
      tipoCartela: grupo.tipoCartela,
      quantidadeChances: obterQuantidadeChances(grupo.tipoCartela),
      quantidadeCombos: quantidadeCombos.toString(),
      quantidadeBilhetes: quantidadeBilhetes.toString(),
      passoEntreChances: primeiroSetor && segundoSetor
        ? (segundoSetor.rangeInicio - primeiroSetor.rangeInicio).toString()
        : '0',
      rangeTotalInicio: primeiroSetor?.rangeTotalInicio.toString() ?? '0',
      rangeTotalFinal: primeiroSetor?.rangeTotalFinal.toString() ?? '0',
      legado: edicao.detalhes.length === 0,
      preco: precoConfigurado ?? edicao.valorCartela.toString(),
      setores: setores.map((setor) => ({
        indiceChance: setor.indiceChance,
        rangeInicio: setor.rangeInicio.toString(),
        rangeFinal: setor.rangeFinal.toString(),
      })),
      rangesConfigurados: grupo.detalhes.map((detalhe) => ({
        indiceChance: detalhe.indiceChance ?? null,
        rangeInicio: detalhe.rangeInicio.toString(),
        rangeFinal: detalhe.rangeFinal.toString(),
        intervalo: (detalhe.rangeFinal - detalhe.rangeInicio + 1n).toString(),
      })),
    };
  });

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
    detalhes: configuracoes,
    premios: edicao.premios.map((premio) => ({
      ...premio,
      valor: premio.valor.toString(),
    })),
  };
}
