import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  DestinoEdicao,
  EdicaoDetalhe,
  OrigemParticipacao,
  TipoCartela,
} from '@prisma/client';
import { CreateEdicaoDetalheDto } from './dto/create-edicao-detalhe.dto';
import { QUANTIDADE_CHANCES_POR_TIPO_CARTELA } from './edicoes.constants';
import { DetalheRangeNormalizado, EdicaoComRelacoes } from './edicoes.types';

export function normalizarDetalhes(
  detalhes: CreateEdicaoDetalheDto[],
): DetalheRangeNormalizado[] {
  return detalhes.map((detalhe) => ({
    origemParticipacao: detalhe.origemParticipacao,
    tipoCartela: detalhe.tipoCartela,
    rangeInicio: BigInt(detalhe.rangeInicio),
    rangeFinal: BigInt(detalhe.rangeFinal),
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
  }

  const ordenados = [...detalhes].sort((a, b) =>
    a.rangeInicio < b.rangeInicio ? -1 : 1,
  );

  for (let i = 1; i < ordenados.length; i += 1) {
    const anterior = ordenados[i - 1];
    const atual = ordenados[i];

    if (possuiSobreposicao(anterior, atual)) {
      throw new ConflictException(
        `Os detalhes da edição possuem ranges sobrepostos: ${anterior.rangeInicio.toString()}-${anterior.rangeFinal.toString()} e ${atual.rangeInicio.toString()}-${atual.rangeFinal.toString()}`,
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
  return origem === OrigemParticipacao.FISICO || origem === OrigemParticipacao.POS;
}

export function calcularResumoDosRanges(
  detalhes: DetalheRangeNormalizado[],
): {
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

export function possuiSobreposicao(
  atual: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
  comparado: Pick<DetalheRangeNormalizado, 'rangeInicio' | 'rangeFinal'>,
): boolean {
  return (
    atual.rangeInicio <= comparado.rangeFinal &&
    comparado.rangeInicio <= atual.rangeFinal
  );
}

export function obterDetalhesComFallback(
  edicao: EdicaoComRelacoes,
): Array<
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
