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
  return detalhes.map((detalhe) => ({
    origemParticipacao: detalhe.origemParticipacao,
    tipoCartela: detalhe.tipoCartela,
    rangeInicio: BigInt(detalhe.rangeInicio),
    rangeFinal: BigInt(detalhe.rangeFinal),
    preco: detalhe.preco,
  }));
}

export function normalizarDetalhesExistentes(
  edicao: EdicaoComRelacoes,
): DetalheRangeNormalizado[] {
  const detalhes = obterDetalhesComFallback(edicao);

  return detalhes.map((detalhe) => ({
    origemParticipacao: detalhe.origemParticipacao,
    tipoCartela: detalhe.tipoCartela,
    rangeInicio: detalhe.rangeInicio,
    rangeFinal: detalhe.rangeFinal,
    preco:
      'preco' in detalhe && detalhe.preco
        ? detalhe.preco.toString()
        : undefined,
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

    if (calcularQuantidadeCombosDoDetalhe(detalhe) < 1n) {
      throw new BadRequestException(
        `O intervalo ${detalhe.rangeInicio.toString()}-${detalhe.rangeFinal.toString()} não suporta ao menos 1 combo para ${detalhe.tipoCartela}`,
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
    'origemParticipacao' | 'tipoCartela' | 'rangeInicio' | 'rangeFinal'
  >,
): SetorDetalheRange[] {
  const quantidadeChances = obterQuantidadeChances(detalhe.tipoCartela);
  const quantidadeCombos = calcularQuantidadeCombosDoDetalhe(detalhe);

  if (quantidadeCombos < 1n) {
    return [];
  }

  return Array.from(
    { length: quantidadeChances },
    (_, index) => {
      const deslocamento = BigInt(index) * quantidadeCombos;
      const rangeInicio = detalhe.rangeInicio + deslocamento;

      return {
        origemParticipacao: detalhe.origemParticipacao,
        tipoCartela: detalhe.tipoCartela,
        indiceChance: index + 1,
        rangeInicio,
        rangeFinal: rangeInicio + quantidadeCombos - 1n,
        rangeTotalInicio: detalhe.rangeInicio,
        rangeTotalFinal: detalhe.rangeFinal,
        quantidadeCombos,
      };
    },
  );
}

export function expandirSetoresDosDetalhes(
  detalhes: Array<
    Pick<
      DetalheRangeNormalizado,
      'origemParticipacao' | 'tipoCartela' | 'rangeInicio' | 'rangeFinal'
    >
  >,
): SetorDetalheRange[] {
  return detalhes.flatMap((detalhe) => expandirSetoresDoDetalhe(detalhe));
}

export function calcularTotalBilhetesDoDetalhe(
  detalhe: Pick<
    DetalheRangeNormalizado,
    'tipoCartela' | 'rangeInicio' | 'rangeFinal'
  >,
): bigint {
  return (
    calcularQuantidadeCombosDoDetalhe(detalhe) *
    BigInt(obterQuantidadeChances(detalhe.tipoCartela))
  );
}

export function calcularTotalBilhetesDosDetalhes(
  detalhes: Array<
    Pick<DetalheRangeNormalizado, 'tipoCartela' | 'rangeInicio' | 'rangeFinal'>
  >,
): bigint {
  return detalhes.reduce(
    (total, detalhe) => total + calcularTotalBilhetesDoDetalhe(detalhe),
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
  detalhe: Pick<DetalheRangeNormalizado, 'tipoCartela' | 'rangeInicio' | 'rangeFinal'>,
): bigint {
  const totalNumeros = detalhe.rangeFinal - detalhe.rangeInicio + 1n;
  return totalNumeros / BigInt(obterQuantidadeChances(detalhe.tipoCartela));
}

export function calcularPassoEntreChancesDoDetalhe(
  detalhe: Pick<DetalheRangeNormalizado, 'tipoCartela' | 'rangeInicio' | 'rangeFinal'>,
): bigint {
  return calcularQuantidadeCombosDoDetalhe(detalhe);
}
