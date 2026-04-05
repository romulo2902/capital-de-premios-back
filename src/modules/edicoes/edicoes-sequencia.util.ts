const UNIVERSO_CARTELA = 50;

export function gerarSequenciaLoterica(
  indice: bigint,
  quantidadeNumeros = 15,
): number[] {
  if (quantidadeNumeros < 1 || quantidadeNumeros > UNIVERSO_CARTELA) {
    throw new Error(
      `quantidadeNumeros deve estar entre 1 e ${UNIVERSO_CARTELA}`,
    );
  }

  const totalCombinacoes = calcularCombinacao(
    UNIVERSO_CARTELA,
    quantidadeNumeros,
  );

  if (indice < 0n || indice >= totalCombinacoes) {
    throw new Error(
      `Índice ${indice.toString()} fora do universo de combinações disponível (${totalCombinacoes.toString()})`,
    );
  }

  return obterCombinacaoPorRank(
    UNIVERSO_CARTELA,
    quantidadeNumeros,
    indice,
  );
}

export function obterTotalCombinacoesCartela(
  quantidadeNumeros: number,
): bigint {
  if (quantidadeNumeros < 1 || quantidadeNumeros > UNIVERSO_CARTELA) {
    throw new Error(
      `quantidadeNumeros deve estar entre 1 e ${UNIVERSO_CARTELA}`,
    );
  }

  return calcularCombinacao(UNIVERSO_CARTELA, quantidadeNumeros);
}

function obterCombinacaoPorRank(n: number, k: number, rankInicial: bigint): number[] {
  const combinacao: number[] = [];
  let rank = rankInicial;
  let inicio = 1;

  for (let posicao = 1; posicao <= k; posicao += 1) {
    for (let candidato = inicio; candidato <= n; candidato += 1) {
      const restantes = k - posicao;

      if (restantes === 0) {
        combinacao.push(candidato);
        inicio = candidato + 1;
        break;
      }

      const quantidadeComEstePrefixo = calcularCombinacao(
        n - candidato,
        restantes,
      );

      if (rank < quantidadeComEstePrefixo) {
        combinacao.push(candidato);
        inicio = candidato + 1;
        break;
      }

      rank -= quantidadeComEstePrefixo;
    }
  }

  return combinacao;
}

function calcularCombinacao(n: number, k: number): bigint {
  if (k < 0 || k > n) {
    return 0n;
  }

  if (k === 0 || k === n) {
    return 1n;
  }

  const limite = Math.min(k, n - k);
  let resultado = 1n;

  for (let i = 1; i <= limite; i += 1) {
    resultado =
      (resultado * BigInt(n - limite + i)) / BigInt(i);
  }

  return resultado;
}
