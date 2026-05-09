import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DestinoEdicao,
  EdicaoDetalhe,
  OrigemParticipacao,
  TipoCartela,
} from '@prisma/client';
import { CreateEdicaoDetalheDto } from './dto/create-edicao-detalhe.dto';
import { QUANTIDADE_CARTELAS_POR_TIPO_CARTELA } from './edicoes.constants';
import { DetalheRangeNormalizado, EdicaoComRelacoes } from './edicoes.types';

export interface SetorDetalheRange {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  indiceCartela: number;
  rangeInicio: bigint;
  rangeFinal: bigint;
  rangeTotalInicio: bigint;
  rangeTotalFinal: bigint;
  quantidadeCombos: bigint;
}

type DetalheRangeExpandivel = Pick<
  DetalheRangeNormalizado,
  | 'origemParticipacao'
  | 'tipoCartela'
  | 'rangeInicio'
  | 'rangeFinal'
  | 'indiceRange'
  | 'ordemConfiguracao'
>;

interface GrupoDetalhesPorTipo {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  detalhes: DetalheRangeExpandivel[];
}

const TIPO_CARTELA_POR_QUANTIDADE = new Map<number, TipoCartela>([
  [1, TipoCartela.UMA_CHANCE],
  [2, TipoCartela.DUAS_CHANCES],
  [3, TipoCartela.TRES_CHANCES],
  [4, TipoCartela.QUATRO_CHANCES],
  [5, TipoCartela.CINCO_CHANCES],
  [6, TipoCartela.SEIS_CHANCES],
  [7, TipoCartela.SETE_CHANCES],
  [8, TipoCartela.OITO_CHANCES],
  [9, TipoCartela.NOVE_CHANCES],
  [10, TipoCartela.DEZ_CHANCES],
  [11, TipoCartela.ONZE_CHANCES],
  [12, TipoCartela.DOZE_CHANCES],
]);

export interface GrupoDetalhesRangeConfiguracao {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  detalhes: DetalheRangeExpandivel[];
}

export function normalizarDetalhes(
  detalhes: CreateEdicaoDetalheDto[],
): DetalheRangeNormalizado[] {
  const quantidadePorOrigem = contarDetalhesPorOrigem(detalhes);
  const proximoIndicePorOrigem = new Map<OrigemParticipacao, number>();

  return detalhes.map((detalhe, index) => {
    const proximoIndice =
      (proximoIndicePorOrigem.get(detalhe.origemParticipacao) ?? 0) + 1;
    const indiceRange = detalhe.indiceRange ?? proximoIndice;
    const quantidadeDaOrigem =
      quantidadePorOrigem.get(detalhe.origemParticipacao) ?? 1;

    proximoIndicePorOrigem.set(
      detalhe.origemParticipacao,
      Math.max(proximoIndice, indiceRange),
    );

    return {
      origemParticipacao: detalhe.origemParticipacao,
      tipoCartela: resolverTipoCartelaBasePorQuantidade(quantidadeDaOrigem),
      indiceRange,
      rangeInicio: BigInt(detalhe.rangeInicio),
      rangeFinal: BigInt(detalhe.rangeFinal),
      ordemConfiguracao: index,
    };
  });
}

export function normalizarDetalhesExistentes(
  edicao: EdicaoComRelacoes,
): DetalheRangeNormalizado[] {
  const detalhes = obterDetalhesComFallback(edicao);
  const quantidadePorOrigem = contarDetalhesPorOrigem(detalhes);

  return detalhes.map((detalhe, index) => ({
    origemParticipacao: detalhe.origemParticipacao,
    tipoCartela: resolverTipoCartelaBasePorQuantidade(
      quantidadePorOrigem.get(detalhe.origemParticipacao) ?? 1,
    ),
    indiceRange:
      'indiceRange' in detalhe && typeof detalhe.indiceRange === 'number'
        ? detalhe.indiceRange
        : index + 1,
    rangeInicio: detalhe.rangeInicio,
    rangeFinal: detalhe.rangeFinal,
    preco:
      'preco' in detalhe && detalhe.preco
        ? detalhe.preco.toString()
        : undefined,
    ordemConfiguracao: index,
  }));
}

export function validarDetalhesInternos(
  detalhes: DetalheRangeNormalizado[],
): void {
  if (detalhes.length === 0) {
    throw new BadRequestException(
      'Informe ao menos um range em detalhes para a edição',
    );
  }

  const porOrigem = new Map<OrigemParticipacao, DetalheRangeNormalizado[]>();

  for (const detalhe of detalhes) {
    if (!isOrigemRangeValida(detalhe.origemParticipacao)) {
      throw new BadRequestException(
        `detalhes aceita apenas origem DIGITAL ou FISICO. Recebido: ${detalhe.origemParticipacao}`,
      );
    }

    if (detalhe.rangeFinal < detalhe.rangeInicio) {
      throw new BadRequestException(
        'rangeFinal deve ser maior ou igual ao rangeInicio',
      );
    }

    if (
      !Number.isInteger(detalhe.indiceRange) ||
      (detalhe.indiceRange ?? 0) < 1
    ) {
      throw new BadRequestException(
        'indiceRange deve ser um inteiro maior ou igual a 1',
      );
    }

    const detalhesOrigem = porOrigem.get(detalhe.origemParticipacao) ?? [];
    if (
      detalhesOrigem.some((item) => item.indiceRange === detalhe.indiceRange)
    ) {
      throw new ConflictException(
        `indiceRange duplicado para origem ${detalhe.origemParticipacao}: ${detalhe.indiceRange}`,
      );
    }

    detalhesOrigem.push(detalhe);
    porOrigem.set(detalhe.origemParticipacao, detalhesOrigem);
  }

  for (const [origem, detalhesOrigem] of porOrigem.entries()) {
    const ordenados = [...detalhesOrigem].sort(
      (a, b) => (a.indiceRange ?? 0) - (b.indiceRange ?? 0),
    );

    for (let i = 0; i < ordenados.length; i += 1) {
      const esperado = i + 1;
      if (ordenados[i].indiceRange !== esperado) {
        throw new BadRequestException(
          `Os índices de range para ${origem} devem formar uma sequência contínua iniciando em 1 (1..N)`,
        );
      }
    }

    const tamanhoBase = ordenados[0].rangeFinal - ordenados[0].rangeInicio + 1n;
    const possuiTamanhoDiferente = ordenados.some(
      (detalhe) =>
        detalhe.rangeFinal - detalhe.rangeInicio + 1n !== tamanhoBase,
    );

    if (possuiTamanhoDiferente) {
      throw new BadRequestException(
        `Todos os ranges da origem ${origem} devem ter o mesmo tamanho para manter o pareamento das cartelas`,
      );
    }
  }

  const detalhesOrdenados = [...detalhes].sort((a, b) =>
    a.rangeInicio < b.rangeInicio ? -1 : a.rangeInicio > b.rangeInicio ? 1 : 0,
  );

  for (let i = 1; i < detalhesOrdenados.length; i += 1) {
    const anterior = detalhesOrdenados[i - 1];
    const atual = detalhesOrdenados[i];

    if (possuiSobreposicao(anterior, atual)) {
      throw new ConflictException(
        `Os intervalos configurados para a edição se sobrepõem: ${anterior.origemParticipacao}/${anterior.indiceRange} (${anterior.rangeInicio.toString()}-${anterior.rangeFinal.toString()}) e ${atual.origemParticipacao}/${atual.indiceRange} (${atual.rangeInicio.toString()}-${atual.rangeFinal.toString()})`,
      );
    }
  }
}

export function validarDestinoComDetalhes(
  destino: DestinoEdicao,
  detalhes: DetalheRangeNormalizado[],
): void {
  const possuiDigital = detalhes.some((detalhe) =>
    isOrigemDigital(detalhe.origemParticipacao),
  );
  const possuiFisica = detalhes.some((detalhe) =>
    isOrigemFisica(detalhe.origemParticipacao),
  );

  if (possuiDigital && possuiFisica && destino !== DestinoEdicao.AMBOS) {
    throw new BadRequestException(
      'Quando houver participação DIGITAL e FISICO na mesma edição, o destino deve ser AMBOS',
    );
  }

  if (possuiDigital && !possuiFisica && destino === DestinoEdicao.LOJA_FISICA) {
    throw new BadRequestException(
      'Destino LOJA_FISICA é incompatível com detalhes exclusivamente DIGITAIS',
    );
  }

  if (possuiFisica && !possuiDigital && destino === DestinoEdicao.SITE) {
    throw new BadRequestException(
      'Destino SITE é incompatível com detalhes exclusivamente FISICOS',
    );
  }
}

export function inferirDestinoPorDetalhes(
  detalhes: DetalheRangeNormalizado[],
): DestinoEdicao {
  const possuiDigital = detalhes.some((detalhe) =>
    isOrigemDigital(detalhe.origemParticipacao),
  );
  const possuiFisica = detalhes.some((detalhe) =>
    isOrigemFisica(detalhe.origemParticipacao),
  );

  if (possuiDigital && possuiFisica) {
    return DestinoEdicao.AMBOS;
  }

  if (possuiFisica) {
    return DestinoEdicao.LOJA_FISICA;
  }

  return DestinoEdicao.SITE;
}

export function isOrigemDigital(origem: OrigemParticipacao): boolean {
  return origem === OrigemParticipacao.DIGITAL;
}

export function isOrigemFisica(origem: OrigemParticipacao): boolean {
  return origem === OrigemParticipacao.FISICO;
}

function isOrigemRangeValida(origem: OrigemParticipacao): boolean {
  return isOrigemDigital(origem) || isOrigemFisica(origem);
}

export function calcularResumoDosRanges(detalhes: DetalheRangeNormalizado[]): {
  rangeInicio: bigint;
  rangeFinal: bigint;
} {
  if (detalhes.length === 0) {
    throw new BadRequestException(
      'Não é possível calcular resumo sem ranges configurados',
    );
  }

  const rangeInicio = detalhes.reduce(
    (menor, detalhe) =>
      detalhe.rangeInicio < menor ? detalhe.rangeInicio : menor,
    detalhes[0].rangeInicio,
  );

  const rangeFinal = detalhes.reduce(
    (maior, detalhe) =>
      detalhe.rangeFinal > maior ? detalhe.rangeFinal : maior,
    detalhes[0].rangeFinal,
  );

  return { rangeInicio, rangeFinal };
}

export function expandirSetoresDoDetalhe(
  detalhe: DetalheRangeExpandivel,
): SetorDetalheRange[] {
  return expandirSetoresDosDetalhes([detalhe]);
}

export function expandirSetoresDosDetalhes(
  detalhes: DetalheRangeExpandivel[],
): SetorDetalheRange[] {
  const grupos = agruparDetalhesPorOrigemETipo(detalhes);
  const setores: SetorDetalheRange[] = [];

  for (const grupo of grupos) {
    const detalhesDoGrupo = ordenarDetalhesDoGrupo(grupo.detalhes);

    if (detalhesDoGrupo.length === 0) {
      continue;
    }

    const rangeTotalInicio = detalhesDoGrupo.reduce(
      (menor, detalhe) =>
        detalhe.rangeInicio < menor ? detalhe.rangeInicio : menor,
      detalhesDoGrupo[0].rangeInicio,
    );
    const rangeTotalFinal = detalhesDoGrupo.reduce(
      (maior, detalhe) =>
        detalhe.rangeFinal > maior ? detalhe.rangeFinal : maior,
      detalhesDoGrupo[0].rangeFinal,
    );
    const quantidadeCombos =
      detalhesDoGrupo[0].rangeFinal - detalhesDoGrupo[0].rangeInicio + 1n;

    detalhesDoGrupo.forEach((detalhe, index) => {
      setores.push({
        origemParticipacao: detalhe.origemParticipacao,
        tipoCartela: detalhe.tipoCartela,
        indiceCartela: detalhe.indiceRange ?? index + 1,
        rangeInicio: detalhe.rangeInicio,
        rangeFinal: detalhe.rangeFinal,
        rangeTotalInicio,
        rangeTotalFinal,
        quantidadeCombos,
      });
    });
  }

  return setores;
}

export function calcularTotalBilhetesDoDetalhe(
  detalhe: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
): bigint {
  return detalhe.rangeFinal - detalhe.rangeInicio + 1n;
}

export function calcularTotalBilhetesDosDetalhes(
  detalhes: DetalheRangeExpandivel[],
): bigint {
  return detalhes.reduce(
    (total, detalhe) => total + (detalhe.rangeFinal - detalhe.rangeInicio + 1n),
    0n,
  );
}

export function possuiSobreposicao(
  atual: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
  comparado: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
): boolean {
  return (
    atual.rangeInicio <= comparado.rangeFinal &&
    comparado.rangeInicio <= atual.rangeFinal
  );
}

export function obterDetalhesComFallback(edicao: EdicaoComRelacoes): Array<
  | EdicaoDetalhe
  | (DetalheRangeNormalizado & {
      id: string;
      createdAt: Date;
      updatedAt: Date;
    })
> {
  if (edicao.detalhes.length > 0) {
    return edicao.detalhes;
  }

  return [
    {
      id: `legacy-${edicao.id}`,
      origemParticipacao: OrigemParticipacao.DIGITAL,
      tipoCartela: TipoCartela.UMA_CHANCE,
      indiceRange: 1,
      rangeInicio: edicao.rangeInicio,
      rangeFinal: edicao.rangeFinal,
      createdAt: edicao.createdAt,
      updatedAt: edicao.createdAt,
    },
  ];
}

export function obterQuantidadeCartelas(tipoCartela: TipoCartela): number {
  return QUANTIDADE_CARTELAS_POR_TIPO_CARTELA[tipoCartela];
}

export function obterTipoCartelaPorQuantidadeCartelas(
  quantidadeCartelas: number,
): TipoCartela | null {
  return TIPO_CARTELA_POR_QUANTIDADE.get(quantidadeCartelas) ?? null;
}

export function calcularQuantidadeCombosDoDetalhe(
  detalhe: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
): bigint {
  return detalhe.rangeFinal - detalhe.rangeInicio + 1n;
}

export function calcularPassoEntreCartelasDoDetalhe(
  detalhe: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
): bigint {
  return calcularQuantidadeCombosDoDetalhe(detalhe);
}

export function agruparDetalhesPorOrigemETipoCartela(
  detalhes: DetalheRangeExpandivel[],
): GrupoDetalhesRangeConfiguracao[] {
  return agruparDetalhesPorOrigemETipo(detalhes).map((grupo) => ({
    origemParticipacao: grupo.origemParticipacao,
    tipoCartela: grupo.tipoCartela,
    detalhes: ordenarDetalhesDoGrupo(grupo.detalhes),
  }));
}

function contarDetalhesPorOrigem<
  T extends Pick<DetalheRangeExpandivel, 'origemParticipacao'>,
>(detalhes: T[]): Map<OrigemParticipacao, number> {
  const quantidadePorOrigem = new Map<OrigemParticipacao, number>();

  for (const detalhe of detalhes) {
    quantidadePorOrigem.set(
      detalhe.origemParticipacao,
      (quantidadePorOrigem.get(detalhe.origemParticipacao) ?? 0) + 1,
    );
  }

  return quantidadePorOrigem;
}

function resolverTipoCartelaBasePorQuantidade(
  quantidadeRanges: number,
): TipoCartela {
  return (
    obterTipoCartelaPorQuantidadeCartelas(quantidadeRanges) ??
    TipoCartela.DOZE_CHANCES
  );
}

function agruparDetalhesPorOrigemETipo(
  detalhes: DetalheRangeExpandivel[],
): GrupoDetalhesPorTipo[] {
  const grupos = new Map<string, GrupoDetalhesPorTipo>();

  for (const detalhe of detalhes) {
    const key = `${detalhe.origemParticipacao}:${detalhe.tipoCartela}`;
    const existente = grupos.get(key);

    if (existente) {
      existente.detalhes.push(detalhe);
      continue;
    }

    grupos.set(key, {
      origemParticipacao: detalhe.origemParticipacao,
      tipoCartela: detalhe.tipoCartela,
      detalhes: [detalhe],
    });
  }

  return Array.from(grupos.values());
}

function ordenarDetalhesDoGrupo<T extends DetalheRangeExpandivel>(
  detalhes: T[],
): T[] {
  const todosComIndice = detalhes.every(
    (detalhe) => typeof detalhe.indiceRange === 'number',
  );

  if (todosComIndice) {
    return [...detalhes].sort(
      (a, b) => (a.indiceRange ?? 0) - (b.indiceRange ?? 0),
    );
  }

  return [...detalhes].sort((a, b) => {
    const ordemA = a.ordemConfiguracao ?? 0;
    const ordemB = b.ordemConfiguracao ?? 0;

    if (ordemA !== ordemB) {
      return ordemA - ordemB;
    }

    return a.rangeInicio < b.rangeInicio
      ? -1
      : a.rangeInicio > b.rangeInicio
        ? 1
        : 0;
  });
}
