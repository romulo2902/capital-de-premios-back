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
} from 'class-transformer';
import { CreateEdicaoDto } from './create-edicao.dto';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';
import { CreateEdicaoPremioDto } from './create-edicao-premio.dto';

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

  return Array.isArray(parsedValue)
    ? plainToInstance(CreateEdicaoDetalheDto, parsedValue)
    : parsedValue;
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

  return Array.isArray(parsedValue)
    ? plainToInstance(CreateEdicaoPremioDto, parsedValue)
    : parsedValue;
};

export class UpdateEdicaoDto extends PartialType(CreateEdicaoDto) {
  @ApiPropertyOptional({
    type: [CreateEdicaoDetalheDto],
    description:
      'Novo conjunto de detalhes/ranges totais da edição. Quando informado, substitui integralmente os detalhes existentes e revalida os setores determinísticos de cada chance.',
  })
  @Transform(parseDetalhesInput)
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
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  premios?: CreateEdicaoPremioDto[];
}
