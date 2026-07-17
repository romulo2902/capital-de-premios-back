import { formatDateTimeForInput } from '../../common/utils/business-date-time.util';
import { serializarEstadoManutencao } from './edicao-manutencao.util';
import { obterQuantidadeCartelas } from './edicoes-range.util';
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
  const combos = edicao.combos.map((combo) => {
    const quantidadeCartelas = obterQuantidadeCartelas(combo.tipoCartela);
    const valorCombo = formatarValorMonetario(combo.preco);

    return {
      id: combo.id,
      edicaoId: combo.edicaoId,
      origemParticipacao: combo.origemParticipacao,
      tipoCompra: 'COMBO',
      quantidadeCartelas,
      valorCombo,
      preco: valorCombo,
      rangeInicio: combo.rangeInicio.toString(),
      rangeFinal: combo.rangeFinal.toString(),
      createdAt: combo.createdAt,
      updatedAt: combo.updatedAt,
    };
  });

  /* eslint-disable @typescript-eslint/no-unused-vars -- descarta campos legados: detalhes (BigInt não serializável), valorCartela e rangeInicio/rangeFinal agregados (range agora vive só no combo) */
  const {
    detalhes: _detalhes,
    valorCartela: _valorCartela,
    rangeInicio: _rangeInicio,
    rangeFinal: _rangeFinal,
    ...edicaoSemLegado
  } = edicao;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  return {
    ...edicaoSemLegado,
    imagemUrl: edicao.imagemUrl ?? null,
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
    combos,
    premios: edicao.premios.map((premio) => ({
      ...premio,
      valor: premio.valor.toString(),
      imagemUrl: premio.imagemUrl,
    })),
  };
}
