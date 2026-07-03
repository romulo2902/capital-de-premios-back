import { createHash, randomInt, randomUUID } from 'node:crypto';

const UNIVERSO_CARTELA = 50;
const FEISTEL_ROUNDS = 4;

export interface ContextoSequenciaLoterica {
  sorteioId: string;
  timestamp: string;
  seed: string;
}

export interface CriarContextoSequenciaParams {
  seed?: string;
  sorteioId?: string;
  timestamp?: string;
}

export interface GerarSequenciaLotericaOptions {
  contexto?: ContextoSequenciaLoterica;
  seed?: string;
  ordenar?: boolean;
}

export interface SequenciaLotericaResultado {
  numeros: number[];
  numerosOrdenados: number[];
  sorteioId: string;
  timestamp: string;
  seed: string;
}

export function criarContextoSequenciaLoterica(
  params: CriarContextoSequenciaParams = {},
): ContextoSequenciaLoterica {
  const sorteioId = params.sorteioId ?? randomUUID().replace(/-/g, '');
  const timestamp = params.timestamp ?? new Date().toISOString();
  const seed = params.seed ?? `${sorteioId}:${timestamp}`;

  return {
    sorteioId,
    timestamp,
    seed,
  };
}

export function criarContextoSequenciaLotericaDeterministico(
  seed: string,
  timestamp = new Date().toISOString(),
): ContextoSequenciaLoterica {
  return {
    sorteioId: createHash('sha256').update(seed).digest('hex').slice(0, 24),
    timestamp,
    seed,
  };
}

export function gerarSequenciaLoterica(
  indice: bigint,
  quantidadeNumeros = 15,
  options: GerarSequenciaLotericaOptions = {},
): SequenciaLotericaResultado {
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

  const contexto =
    options.contexto ??
    criarContextoSequenciaLoterica(
      options.seed ? { seed: options.seed } : undefined,
    );

  const rankPermutado = permutarIndice(
    indice,
    totalCombinacoes,
    `${contexto.seed}:rank`,
  );

  const numerosOrdenados = obterCombinacaoPorRank(
    UNIVERSO_CARTELA,
    quantidadeNumeros,
    rankPermutado,
  );

  const numeros = embaralharSequencia(
    numerosOrdenados,
    `${contexto.seed}:shuffle:${indice.toString()}`,
    options.ordenar ?? false,
  );

  return {
    numeros,
    numerosOrdenados: [...numerosOrdenados],
    sorteioId: contexto.sorteioId,
    timestamp: contexto.timestamp,
    seed: contexto.seed,
  };
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

function embaralharSequencia(
  numerosOrdenados: number[],
  seed: string,
  ordenar: boolean,
): number[] {
  const numeros = [...numerosOrdenados];

  for (let i = numeros.length - 1; i > 0; i -= 1) {
    const j = obterIndiceAleatorioDeterministico(i + 1, `${seed}:${i}`);
    [numeros[i], numeros[j]] = [numeros[j], numeros[i]];
  }

  if (ordenar) {
    numeros.sort((a, b) => a - b);
  }

  return numeros;
}

function obterIndiceAleatorioDeterministico(maxExclusive: number, seed: string): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('maxExclusive deve ser um inteiro maior que zero');
  }

  if (!seed) {
    return randomInt(0, maxExclusive);
  }

  const hash = createHash('sha256').update(seed).digest();
  const valor = hash.readUIntBE(0, 6);

  return valor % maxExclusive;
}

function obterCombinacaoPorRank(
  n: number,
  k: number,
  rankInicial: bigint,
): number[] {
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
    resultado = (resultado * BigInt(n - limite + i)) / BigInt(i);
  }

  return resultado;
}

function permutarIndice(
  indice: bigint,
  modulo: bigint,
  seed: string,
): bigint {
  if (modulo <= 1n) {
    return 0n;
  }

  const bits = calcularBitsNecessarios(modulo);
  const halfBits = Math.ceil(bits / 2);
  const domainBits = halfBits * 2;
  const domainSize = 1n << BigInt(domainBits);
  let valor = indice;

  while (true) {
    valor = permutarNoDominioBinario(valor, halfBits, seed);

    if (valor < modulo) {
      return valor;
    }

    valor %= domainSize;
  }
}

function permutarNoDominioBinario(
  valor: bigint,
  halfBits: number,
  seed: string,
): bigint {
  const mask = (1n << BigInt(halfBits)) - 1n;
  let left = (valor >> BigInt(halfBits)) & mask;
  let right = valor & mask;

  for (let round = 0; round < FEISTEL_ROUNDS; round += 1) {
    const mistura =
      hashParaBigInt(`${seed}:${round}:${right.toString()}`) & mask;
    const nextLeft = right;
    const nextRight = (left ^ mistura) & mask;

    left = nextLeft;
    right = nextRight;
  }

  return (left << BigInt(halfBits)) | right;
}

function calcularBitsNecessarios(valor: bigint): number {
  let atual = valor - 1n;
  let bits = 0;

  while (atual > 0n) {
    atual >>= 1n;
    bits += 1;
  }

  return bits === 0 ? 1 : bits;
}

function hashParaBigInt(valor: string): bigint {
  const hash = createHash('sha256').update(valor).digest('hex');
  return BigInt(`0x${hash}`);
}
