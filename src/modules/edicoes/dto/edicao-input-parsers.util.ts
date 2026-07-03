import { BadRequestException } from '@nestjs/common';
import {
  plainToInstance,
  TransformFnParams,
} from 'class-transformer';
import { OrigemParticipacao } from '@prisma/client';
import { CreateEdicaoComboDto } from './create-edicao-combo.dto';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';
import { CreateEdicaoPremioDto } from './create-edicao-premio.dto';

type DtoClass<T> = new () => T;

const ORIGENS_DETALHE_ACEITAS = new Set<OrigemParticipacao>([
  OrigemParticipacao.DIGITAL,
  OrigemParticipacao.FISICO,
]);

function parseJsonInput(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return value;
  }

  try {
    return JSON.parse(normalizedValue);
  } catch {
    throw new BadRequestException(`${fieldName} deve ser um JSON válido`);
  }
}

function plainToDtoArray<T>(dtoClass: DtoClass<T>, value: unknown): T[] | unknown {
  if (Array.isArray(value)) {
    return plainToInstance(dtoClass, value);
  }

  if (value && typeof value === 'object') {
    return plainToInstance(dtoClass, [value]);
  }

  return value;
}

function isDetalheAvulso(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ('rangeInicio' in value || 'rangeFinal' in value)
  );
}

function normalizarDetalhesAgrupados(
  parsedValue: unknown,
): Array<Record<string, unknown>> | unknown {
  // Caso especial: Swagger ou usuários podem enviar o objeto agrupado dentro de um array de um único item
  // devido à tipagem do campo ser um array no DTO.
  if (
    Array.isArray(parsedValue) &&
    parsedValue.length === 1 &&
    parsedValue[0] &&
    typeof parsedValue[0] === 'object' &&
    !isDetalheAvulso(parsedValue[0])
  ) {
    return normalizarDetalhesAgrupados(parsedValue[0]);
  }

  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
    return parsedValue;
  }

  if (isDetalheAvulso(parsedValue)) {
    return parsedValue;
  }

  const entries = Object.entries(parsedValue);

  if (entries.length === 0) {
    return [];
  }

  const detalhes: Array<Record<string, unknown>> = [];

  for (const [origemKey, ranges] of entries) {
    const origem = origemKey as OrigemParticipacao;

    if (!ORIGENS_DETALHE_ACEITAS.has(origem)) {
      throw new BadRequestException(
        `detalhes aceita apenas as chaves DIGITAL e FISICO. Recebido: ${origemKey}`,
      );
    }

    if (!Array.isArray(ranges)) {
      throw new BadRequestException(
        `detalhes.${origemKey} deve ser um array de setores/ranges`,
      );
    }

    for (const range of ranges) {
      if (!range || typeof range !== 'object' || Array.isArray(range)) {
        throw new BadRequestException(
          `Cada item de detalhes.${origemKey} deve ser um objeto válido`,
        );
      }

      detalhes.push({
        ...range,
        origemParticipacao: origem,
      });
    }
  }

  return detalhes;
}

export const parseArrayOfDtoInput =
  <T>(fieldName: string, dtoClass: DtoClass<T>) =>
  ({ value }: TransformFnParams): unknown => {
    const parsedValue = parseJsonInput(value, fieldName);
    return plainToDtoArray(dtoClass, parsedValue);
  };

export const parseDetalhesInput = ({ value }: TransformFnParams): unknown => {
  const parsedValue = parseJsonInput(value, 'detalhes');
  const detalhesNormalizados = normalizarDetalhesAgrupados(parsedValue);

  if (Array.isArray(detalhesNormalizados)) {
    return plainToInstance(CreateEdicaoDetalheDto, detalhesNormalizados);
  }

  if (isDetalheAvulso(detalhesNormalizados)) {
    return plainToInstance(CreateEdicaoDetalheDto, [detalhesNormalizados]);
  }

  return detalhesNormalizados;
};

export const parseCombosInput = parseArrayOfDtoInput(
  'combos',
  CreateEdicaoComboDto,
);

export const parsePremiosInput = parseArrayOfDtoInput(
  'premios',
  CreateEdicaoPremioDto,
);
