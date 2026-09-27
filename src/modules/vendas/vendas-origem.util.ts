import { OrigemParticipacao } from '@prisma/client';

/**
 * Origem cujo combo (range, preço e intervalo) vale para a venda.
 *
 * POS não possui ranges próprios: as vendas POS usam a mesma configuração
 * DIGITAL. Quem precisa do combo de uma venda já feita — o relatório de
 * cabeças, por exemplo — tem que passar por aqui; procurar pela origem crua
 * não acha combo nenhum para POS.
 */
export function resolverOrigemDoCombo(
  origemParticipacao: OrigemParticipacao,
): OrigemParticipacao {
  if (origemParticipacao === OrigemParticipacao.POS) {
    return OrigemParticipacao.DIGITAL;
  }

  return origemParticipacao;
}
