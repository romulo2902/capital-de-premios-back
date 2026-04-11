import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  DestinoEdicao,
  EdicaoDetalhe,
  OrigemParticipacao,
  TipoCartela,
} from '@prisma/client';
import { CreateEdicaoDetalheDto } from './dto/create-edicao-detalhe.dto';
import { QUANTIDADE_CHANCES_POR_TIPO_CARTELA } from './edicoes.constants';
import { DetalheRangeNormalizado, EdicaoComRelacoes } from './edicoes.types';

export interface SetorDetalheRange {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  indiceChance: number;
  rangeInicio: bigint;
  rangeFinal: bigint;
  rangeTotalInicio: bigint;
  rangeTotalFinal: bigint;
  quantidadeCombos: bigint;
}

export function normalizarDetalhes(
  detalhes: CreateEdicaoDetalheDto[],
): DetalheRangeNormalizado[] {
  return detalhes.map((detalhe, index) => ({
    origemParticipacao: detalhe.origemParticipacao,
    tipoCartela: detalhe.tipoCartela,
    rangeInicio: BigInt(detalhe.rangeInicio),
    rangeFinal: BigInt(detalhe.rangeFinal),
    preco: detalhe.preco,
    indiceChance: detalhe.indiceChance,
    ordemConfiguracao: index,
  }));
}

export function normalizarDetalhesExistentes(
  edicao: EdicaoComRelacoes,
): DetalheRangeNormalizado[] {
  const detalhes = obterDetalhesComFallback(edicao);

  return detalhes.map((detalhe, index) => ({
    origemParticipacao: detalhe.origemParticipacao,
    tipoCartela: detalhe.tipoCartela,
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
  for (const detalhe of detalhes) {
    if (detalhe.rangeFinal < detalhe.rangeInicio) {
      throw new BadRequestException(
        'rangeFinal deve ser maior ou igual ao rangeInicio',
      );
    }

    if (detalhe.rangeFinal - detalhe.rangeInicio + 1n < 1n) {
      throw new BadRequestException(
        `O intervalo ${detalhe.rangeInicio.toString()}-${detalhe.rangeFinal.toString()} não suporta ao menos 1 combo para ${detalhe.tipoCartela}`,
      );
    }
  }

  const grupos = agruparDetalhesPorOrigemETipo(detalhes);

  for (const grupo of grupos) {
    const quantidadeChances = obterQuantidadeChances(grupo.tipoCartela);
    if (grupo.detalhes.length !== 1 && grupo.detalhes.length !== quantidadeChances) {
      throw new BadRequestException(
        `A configuração ${grupo.origemParticipacao}/${grupo.tipoCartela} deve ter 1 range (automático) ou ${quantidadeChances} ranges (manual por chance). Recebido: ${grupo.detalhes.length}`,
      );
    }

    if (grupo.detalhes.length === quantidadeChances) {
      const todosComIndice = grupo.detalhes.every(
        (detalhe) => typeof detalhe.indiceChance === 'number',
      );
      const algumComIndice = grupo.detalhes.some(
        (detalhe) => typeof detalhe.indiceChance === 'number',
      );

      if (algumComIndice && !todosComIndice) {
        throw new BadRequestException(
          `A configuração ${grupo.origemParticipacao}/${grupo.tipoCartela} deve informar indiceChance em todos os ranges ou em nenhum`,
        );
      }

      if (todosComIndice) {
        const indices = grupo.detalhes.map((detalhe) => detalhe.indiceChance ?? 0);
        const indicesUnicos = new Set(indices);
        const possuiForaDoIntervalo = indices.some(
          (indice) => indice < 1 || indice > quantidadeChances,
        );

        if (possuiForaDoIntervalo) {
          throw new BadRequestException(
            `indiceChance inválido para ${grupo.origemParticipacao}/${grupo.tipoCartela}. Use valores de 1 até ${quantidadeChances}`,
          );
        }

        if (indicesUnicos.size !== quantidadeChances) {
          throw new BadRequestException(
            `indiceChance duplicado ou ausente em ${grupo.origemParticipacao}/${grupo.tipoCartela}. Informe os índices de 1 até ${quantidadeChances} sem repetição`,
          );
        }
      }

      const tamanhos = grupo.detalhes.map(
        (detalhe) => detalhe.rangeFinal - detalhe.rangeInicio + 1n,
      );
      const primeiro = tamanhos[0];
      const tamanhosDiferentes = tamanhos.some((tamanho) => tamanho !== primeiro);
      if (tamanhosDiferentes) {
        throw new BadRequestException(
          `Os ranges de ${grupo.origemParticipacao}/${grupo.tipoCartela} devem ter o mesmo tamanho para manter o pareamento dos bilhetes`,
        );
      }
    }

    const precosInformados = grupo.detalhes
      .map((detalhe) => detalhe.preco?.replace(',', '.').trim())
      .filter((preco): preco is string => Boolean(preco));

    if (precosInformados.length > 1) {
      const precoBase = precosInformados[0];
      const possuiPrecoDiferente = precosInformados.some(
        (preco) => preco !== precoBase,
      );

      if (possuiPrecoDiferente) {
        throw new BadRequestException(
          `Preço inconsistente em ${grupo.origemParticipacao}/${grupo.tipoCartela}. O preço é por combo e deve ser igual em todas as chances do mesmo tipo`,
        );
      }
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
        `Os intervalos configurados para a edição se sobrepõem: ${anterior.tipoCartela} (${anterior.rangeInicio.toString()}-${anterior.rangeFinal.toString()}) e ${atual.tipoCartela} (${atual.rangeInicio.toString()}-${atual.rangeFinal.toString()})`,
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
      'Quando houver participação DIGITAL e FISICA na mesma edição, o destino deve ser AMBOS',
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
  return (
    origem === OrigemParticipacao.FISICO || origem === OrigemParticipacao.POS
  );
}

export function calcularResumoDosRanges(detalhes: DetalheRangeNormalizado[]): {
  rangeInicio: bigint;
  rangeFinal: bigint;
} {
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
  detalhe: Pick<
    DetalheRangeNormalizado,
    | 'origemParticipacao'
    | 'tipoCartela'
    | 'rangeInicio'
    | 'rangeFinal'
    | 'indiceChance'
    | 'ordemConfiguracao'
  >,
): SetorDetalheRange[] {
  return expandirSetoresDosDetalhes([detalhe]);
}

export function expandirSetoresDosDetalhes(
  detalhes: Array<
    Pick<
      DetalheRangeNormalizado,
      | 'origemParticipacao'
      | 'tipoCartela'
      | 'rangeInicio'
      | 'rangeFinal'
      | 'indiceChance'
      | 'ordemConfiguracao'
    >
  >,
): SetorDetalheRange[] {
  const grupos = agruparDetalhesPorOrigemETipo(detalhes);
  const setores: SetorDetalheRange[] = [];

  for (const grupo of grupos) {
    const quantidadeChances = obterQuantidadeChances(grupo.tipoCartela);
    const detalhesDoGrupo = ordenarDetalhesDoGrupo(grupo.detalhes);

    if (detalhesDoGrupo.length === quantidadeChances) {
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
          indiceChance: index + 1,
          rangeInicio: detalhe.rangeInicio,
          rangeFinal: detalhe.rangeFinal,
          rangeTotalInicio,
          rangeTotalFinal,
          quantidadeCombos,
        });
      });
      continue;
    }

    const detalhe = detalhesDoGrupo[0];
    const quantidadeCombos = calcularQuantidadeCombosDoDetalhe(detalhe);

    if (quantidadeCombos < 1n) {
      continue;
    }

    Array.from({ length: quantidadeChances }, (_, index) => {
      const deslocamento = BigInt(index) * quantidadeCombos;
      const rangeInicio = detalhe.rangeInicio + deslocamento;

      setores.push({
        origemParticipacao: detalhe.origemParticipacao,
        tipoCartela: detalhe.tipoCartela,
        indiceChance: index + 1,
        rangeInicio,
        rangeFinal: rangeInicio + quantidadeCombos - 1n,
        rangeTotalInicio: detalhe.rangeInicio,
        rangeTotalFinal: detalhe.rangeFinal,
        quantidadeCombos,
      });
    });
  }

  return setores;
}

export function calcularTotalBilhetesDoDetalhe(
  detalhe: Pick<
    DetalheRangeNormalizado,
    'tipoCartela' | 'rangeInicio' | 'rangeFinal'
  >,
): bigint {
  return detalhe.rangeFinal - detalhe.rangeInicio + 1n;
}

export function calcularTotalBilhetesDosDetalhes(
  detalhes: Array<
    Pick<
      DetalheRangeNormalizado,
      | 'origemParticipacao'
      | 'tipoCartela'
      | 'rangeInicio'
      | 'rangeFinal'
      | 'indiceChance'
      | 'ordemConfiguracao'
    >
  >,
): bigint {
  return expandirSetoresDosDetalhes(detalhes).reduce(
    (total, setor) => total + (setor.rangeFinal - setor.rangeInicio + 1n),
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
      rangeInicio: edicao.rangeInicio,
      rangeFinal: edicao.rangeFinal,
      createdAt: edicao.createdAt,
      updatedAt: edicao.createdAt,
    },
  ];
}

export function obterQuantidadeChances(tipoCartela: TipoCartela): number {
  return QUANTIDADE_CHANCES_POR_TIPO_CARTELA[tipoCartela];
}

export function calcularQuantidadeCombosDoDetalhe(
  detalhe: Pick<
    DetalheRangeNormalizado,
    'tipoCartela' | 'rangeInicio' | 'rangeFinal'
  >,
): bigint {
  const totalNumeros = detalhe.rangeFinal - detalhe.rangeInicio + 1n;
  return totalNumeros / BigInt(obterQuantidadeChances(detalhe.tipoCartela));
}

export function calcularPassoEntreChancesDoDetalhe(
  detalhe: Pick<
    DetalheRangeNormalizado,
    'tipoCartela' | 'rangeInicio' | 'rangeFinal'
  >,
): bigint {
  return calcularQuantidadeCombosDoDetalhe(detalhe);
}

interface GrupoDetalhesPorTipo {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  detalhes: Array<
    Pick<
      DetalheRangeNormalizado,
      | 'origemParticipacao'
      | 'tipoCartela'
      | 'rangeInicio'
      | 'rangeFinal'
      | 'indiceChance'
      | 'ordemConfiguracao'
      | 'preco'
    >
  >;
}

export interface GrupoDetalhesRangeConfiguracao {
  origemParticipacao: OrigemParticipacao;
  tipoCartela: TipoCartela;
  detalhes: Array<
    Pick<
      DetalheRangeNormalizado,
      | 'origemParticipacao'
      | 'tipoCartela'
      | 'rangeInicio'
      | 'rangeFinal'
      | 'indiceChance'
      | 'ordemConfiguracao'
      | 'preco'
    >
  >;
}

function agruparDetalhesPorOrigemETipo(
  detalhes: Array<
    Pick<
      DetalheRangeNormalizado,
      | 'origemParticipacao'
      | 'tipoCartela'
      | 'rangeInicio'
      | 'rangeFinal'
      | 'indiceChance'
      | 'ordemConfiguracao'
      | 'preco'
    >
  >,
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

export function agruparDetalhesPorOrigemETipoCartela(
  detalhes: Array<
    Pick<
      DetalheRangeNormalizado,
      | 'origemParticipacao'
      | 'tipoCartela'
      | 'rangeInicio'
      | 'rangeFinal'
      | 'indiceChance'
      | 'ordemConfiguracao'
      | 'preco'
    >
  >,
): GrupoDetalhesRangeConfiguracao[] {
  return agruparDetalhesPorOrigemETipo(detalhes).map((grupo) => ({
    origemParticipacao: grupo.origemParticipacao,
    tipoCartela: grupo.tipoCartela,
    detalhes: ordenarDetalhesDoGrupo(grupo.detalhes),
  }));
}

function ordenarDetalhesDoGrupo<T extends { indiceChance?: number; ordemConfiguracao?: number }>(
  detalhes: T[],
): T[] {
  const todosComIndice = detalhes.every(
    (detalhe) => typeof detalhe.indiceChance === 'number',
  );

  if (todosComIndice) {
    return [...detalhes].sort(
      (a, b) => (a.indiceChance ?? 0) - (b.indiceChance ?? 0),
    );
  }

  return [...detalhes].sort((a, b) => {
    const ordemA = a.ordemConfiguracao ?? 0;
    const ordemB = b.ordemConfiguracao ?? 0;
    return ordemA - ordemB;
  });
}
