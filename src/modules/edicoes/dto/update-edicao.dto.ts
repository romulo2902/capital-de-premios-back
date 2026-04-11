import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { BadRequestException } from '@nestjs/common';
import {
  IsArray,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import {
  plainToInstance,
  Transform,
  TransformFnParams,
  Type,
} from 'class-transformer';
import { CreateEdicaoDto } from './create-edicao.dto';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';
import { CreateEdicaoPremioDto } from './create-edicao-premio.dto';

type DetalheFlatInput = {
  origemParticipacao?: unknown;
  tipoCartela?: unknown;
  rangeInicio?: unknown;
  rangeFinal?: unknown;
  preco?: unknown;
  indiceChance?: unknown;
};

type DetalheAgrupadoInput = {
  origemParticipacao?: unknown;
  tipoCartela?: unknown;
  preco?: unknown;
  chances?: Array<{
    indiceChance?: unknown;
    rangeInicio?: unknown;
    rangeFinal?: unknown;
  }>;
};

const mapearDetalhesParaFormatoFlat = (value: unknown): unknown => {
  if (!Array.isArray(value)) {
    return value;
  }

  const detalhesFlat: DetalheFlatInput[] = [];

  for (const item of value as Array<DetalheFlatInput | DetalheAgrupadoInput>) {
    if (!item || typeof item !== 'object') {
      detalhesFlat.push(item as DetalheFlatInput);
      continue;
    }

    const itemFlat = item as DetalheFlatInput;
    const itemAgrupado = item as DetalheAgrupadoInput;
    const possuiChances = Array.isArray(itemAgrupado.chances);

    if (!possuiChances) {
      detalhesFlat.push(itemFlat);
      continue;
    }

    for (const chance of itemAgrupado.chances ?? []) {
      detalhesFlat.push({
        origemParticipacao: itemAgrupado.origemParticipacao,
        tipoCartela: itemAgrupado.tipoCartela,
        preco:
          itemAgrupado.preco !== undefined && itemAgrupado.preco !== null
            ? String(itemAgrupado.preco)
            : undefined,
        indiceChance: chance.indiceChance,
        rangeInicio: chance.rangeInicio,
        rangeFinal: chance.rangeFinal,
      });
    }
  }

  return detalhesFlat;
};

const parseDetalhesInput = ({ value }: TransformFnParams): unknown => {
  const parsedValue = (() => {
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
      throw new BadRequestException('detalhes deve ser um JSON válido');
    }
  })();

  const normalizedArrayValue = mapearDetalhesParaFormatoFlat(
    Array.isArray(parsedValue) ? parsedValue : [parsedValue],
  );

  if (Array.isArray(normalizedArrayValue)) {
    return plainToInstance(CreateEdicaoDetalheDto, normalizedArrayValue);
  }

  return parsedValue;
};

const parsePremiosInput = ({ value }: TransformFnParams): unknown => {
  const parsedValue = (() => {
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
      throw new BadRequestException('premios deve ser um JSON válido');
    }
  })();

  if (Array.isArray(parsedValue)) {
    return plainToInstance(CreateEdicaoPremioDto, parsedValue);
  }

  if (parsedValue && typeof parsedValue === 'object') {
    return plainToInstance(CreateEdicaoPremioDto, [parsedValue]);
  }

  return parsedValue;
};

export class UpdateEdicaoDto extends PartialType(CreateEdicaoDto) {
  @ApiPropertyOptional({
    type: [CreateEdicaoDetalheDto],
    description:
      'Novo conjunto de detalhes/ranges totais da edição. Quando informado, substitui integralmente os detalhes existentes e revalida os setores determinísticos de cada chance.',
  })
  @Transform(parseDetalhesInput)
  @Type(() => CreateEdicaoDetalheDto)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  detalhes?: CreateEdicaoDetalheDto[];

  @ApiPropertyOptional({
    type: [CreateEdicaoPremioDto],
    description:
      'Novo conjunto de prêmios da edição. Quando informado, substitui integralmente os prêmios existentes e recalcula `qtdPremios`.',
  })
  @Transform(parsePremiosInput)
  @Type(() => CreateEdicaoPremioDto)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  premios?: CreateEdicaoPremioDto[];
}
