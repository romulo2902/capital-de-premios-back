import { formatDateTimeForInput } from '../../common/utils/business-date-time.util';
import { serializarEstadoManutencao } from './edicao-manutencao.util';
import {
  calcularTotalBilhetesDosDetalhes,
  expandirSetoresDosDetalhes,
  obterDetalhesComFallback,
  obterQuantidadeCartelas,
} from './edicoes-range.util';
import { EdicaoComRelacoes } from './edicoes.types';

function formatarValorMonetario(valor: {
  toFixed: (decimalPlaces: number) => string;
}): string {
  return valor.toFixed(2);
}

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
      quantidadeCartelasBase: obterQuantidadeCartelas(detalhe.tipoCartela),
      quantidadeCombos: quantidadeCombos.toString(),
      quantidadeBilhetes: quantidadeBilhetes.toString(),
      passoEntreCartelas:
        primeiroSetor && segundoSetor
          ? (segundoSetor.rangeInicio - primeiroSetor.rangeInicio).toString()
          : '0',
      rangeTotalInicio: primeiroSetor?.rangeTotalInicio.toString() ?? '0',
      rangeTotalFinal: primeiroSetor?.rangeTotalFinal.toString() ?? '0',
      legado: edicao.detalhes.length === 0,
      setores: setores.map((setor) => ({
        indiceCartela: setor.indiceCartela,
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

  const valorUnitarioCartela = formatarValorMonetario(edicao.valorCartela);
  const combos = edicao.combos.map((combo) => {
    const quantidadeCartelas = obterQuantidadeCartelas(combo.tipoCartela);
    const valorCombo = formatarValorMonetario(combo.preco);

    return {
      id: combo.id,
      edicaoId: combo.edicaoId,
      origemParticipacao: combo.origemParticipacao,
      tipoCompra: quantidadeCartelas === 1 ? 'UNITARIO' : 'COMBO',
      quantidadeCartelas,
      valorUnitarioCartela,
      valorCombo,
      preco: valorCombo,
      createdAt: combo.createdAt,
      updatedAt: combo.updatedAt,
    };
  });

  return {
    ...edicao,
    rangeInicio: edicao.rangeInicio.toString(),
    rangeFinal: edicao.rangeFinal.toString(),
    imagemUrl: edicao.imagemUrl ?? null,
    valorCartela: valorUnitarioCartela,
    valorUnitarioCartela,
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
      imagemUrl: premio.imagemUrl,
    })),
  };
}
