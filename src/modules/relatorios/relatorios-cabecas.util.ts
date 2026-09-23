/**
 * Reconstrução das cartelas de uma venda a partir dos bilhetes dela.
 *
 * O `Bilhete` não guarda qual título é a cabeça: a cartela multi-chance vira N
 * linhas soltas, e a chance `c` é só `cabeça + c * intervalo`. A cabeça é
 * sempre o menor título da própria cartela, então o menor título ainda não
 * atribuído da venda é, necessariamente, a cabeça de uma cartela.
 *
 * Ordenar e pegar as `quantidade` primeiras NÃO serve: com range de cabeça
 * 1–100.000 e intervalo 50.000, a cabeça 10 gera a chance 50.010, menor que a
 * cabeça 60.000 de outra cartela da mesma venda.
 */

export interface CartelaReconstruida {
  cabeca: bigint;
  chances: bigint[];
}

export function reconstruirCartelasDaVenda(
  numeros: bigint[],
  chancesPorCartela: number,
  intervalo: bigint,
): CartelaReconstruida[] {
  const ordenados = [...numeros].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pendentes = new Set(ordenados.map((numero) => numero.toString()));
  const cartelas: CartelaReconstruida[] = [];

  for (const numero of ordenados) {
    if (!pendentes.delete(numero.toString())) {
      continue;
    }

    const chances: bigint[] = [];
    for (let c = 1; c < chancesPorCartela; c++) {
      const titulo = numero + BigInt(c) * intervalo;
      if (pendentes.delete(titulo.toString())) {
        chances.push(titulo);
      }
    }

    cartelas.push({ cabeca: numero, chances });
  }

  return cartelas;
}
