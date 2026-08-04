/**
 * Expansão dos setores de uma cartela multi-chance.
 *
 * Fonte única da verdade: esta lógica estava duplicada em VendasService e
 * LojaPublicaService e as duas cópias divergiram (a loja continuou com o passo
 * fixo de 1 depois que a venda passou a usar o intervalo). Qualquer consumidor
 * novo deve importar daqui.
 */

export interface SetorCombo {
  rangeInicio: bigint;
  rangeFinal: bigint;
  rangeTotalInicio: bigint;
  rangeTotalFinal: bigint;
}

/** Intervalo usado quando a edição não define um (comportamento legado). */
export const INTERVALO_PADRAO = 1n;

/**
 * Normaliza o intervalo vindo da edição.
 *
 * Edições anteriores à coluna `intervalo` (e mocks de teste) podem não trazer o
 * campo; nesse caso vale 1. Valor zero ou negativo colocaria todas as chances
 * no mesmo título, então também cai no mínimo.
 */
export function resolverIntervalo(intervalo?: bigint | null): bigint {
  if (intervalo === undefined || intervalo === null || intervalo < 1n) {
    return INTERVALO_PADRAO;
  }

  return intervalo;
}

/**
 * Expande o range do combo nos setores de cada chance da cartela.
 *
 * A chance `c` recebe o título `cabeça + c * intervalo`, então o range
 * configurado delimita apenas as **cabeças**: os setores das demais chances são
 * o mesmo range deslocado e caem fora do range configurado de propósito (o
 * único teto real é o tamanho da matriz — títulos inexistentes fazem o grupo
 * ser descartado na seleção).
 */
export function expandirSetoresDoCombo(
  combo: { rangeInicio: bigint; rangeFinal: bigint },
  quantidadeCartelas: number,
  intervalo?: bigint | null,
): SetorCombo[] {
  const passo = resolverIntervalo(intervalo);

  return Array.from({ length: quantidadeCartelas }, (_, i) => {
    const deslocamento = BigInt(i) * passo;

    return {
      rangeInicio: combo.rangeInicio + deslocamento,
      rangeFinal: combo.rangeFinal + deslocamento,
      rangeTotalInicio: combo.rangeInicio,
      rangeTotalFinal: combo.rangeFinal,
    };
  });
}

/**
 * Faixa completa ocupada por um combo, já contando as chances deslocadas.
 *
 * Serve para detectar colisão entre combos: o range configurado sozinho não
 * revela o espaço realmente consumido quando há intervalo.
 */
export function calcularFaixaOcupadaPeloCombo(
  combo: { rangeInicio: bigint; rangeFinal: bigint },
  quantidadeCartelas: number,
  intervalo?: bigint | null,
): { inicio: bigint; fim: bigint } {
  const setores = expandirSetoresDoCombo(combo, quantidadeCartelas, intervalo);
  const ultimo = setores[setores.length - 1];

  return {
    inicio: setores[0]?.rangeInicio ?? combo.rangeInicio,
    fim: ultimo?.rangeFinal ?? combo.rangeFinal,
  };
}
