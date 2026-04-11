import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  plainToInstance,
  Transform,
  TransformFnParams,
  Type,
} from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { DestinoEdicao } from '@prisma/client';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';
import { CreateEdicaoPremioDto } from './create-edicao-premio.dto';

const VALOR_CARTELA_REGEX = /^\d+([.,]\d{1,2})?$/;

const parseBooleanInput = ({ value }: TransformFnParams): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  return value;
};

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

export class CreateEdicaoDto {
  @ApiProperty({
    example: 125,
    description: 'Número único da edição/sorteio.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  numero: number;

  @ApiProperty({
    example: '2026-03-27T10:20',
    description:
      'Data e hora do sorteio com precisão de minuto. Aceita `YYYY-MM-DDTHH:mm`, `DD/MM/YYYY HH:mm` ou ISO com fuso e segundos zerados.',
  })
  @IsString()
  dataSorteio: string;

  @ApiPropertyOptional({
    example: '2026-03-27T09:59',
    description:
      'Data e hora de encerramento das vendas com precisão de minuto. Se omitida, assume a mesma data/hora do sorteio.',
  })
  @IsOptional()
  @IsString()
  dataEncerramento?: string;

  @ApiProperty({
    example: '10.00',
    description:
      'Valor unitário da cartela. Aceita ponto ou vírgula como separador decimal.',
  })
  @IsString()
  @Matches(VALOR_CARTELA_REGEX, {
    message: 'valorCartela deve ser um valor monetário válido',
  })
  valorCartela: string;

  @ApiPropertyOptional({
    enum: DestinoEdicao,
    example: DestinoEdicao.AMBOS,
    description:
      'Destino da edição/cartela: site, loja física ou ambos. Se omitido, a API infere a partir dos detalhes enviados.',
  })
  @IsOptional()
  @IsEnum(DestinoEdicao)
  destino?: DestinoEdicao;

  @ApiProperty({
    example: false,
    description: 'Indica se a cartela possui raspadinha.',
  })
  @Transform(parseBooleanInput)
  @IsBoolean()
  raspadinha: boolean;

  @ApiPropertyOptional({
    example: 'Frase do sorteio',
    description: 'Frase exibida na cartela/sorteio no painel administrativo.',
  })
  @IsOptional()
  @IsString()
  frase?: string;

  @ApiProperty({
    type: [CreateEdicaoDetalheDto],
    example: [
      {
        origemParticipacao: 'DIGITAL',
        tipoCartela: 'DUAS_CHANCES',
        preco: '20.00',
        chances: [
          { indiceChance: 1, rangeInicio: '0950000', rangeFinal: '0999980' },
          { indiceChance: 2, rangeInicio: '1950000', rangeFinal: '1999980' },
        ],
      },
      {
        origemParticipacao: 'DIGITAL',
        tipoCartela: 'SEIS_CHANCES',
        preco: '30.00',
        chances: [
          { indiceChance: 1, rangeInicio: '0276531', rangeFinal: '0286521' },
          { indiceChance: 2, rangeInicio: '0376531', rangeFinal: '0386521' },
          { indiceChance: 3, rangeInicio: '0476531', rangeFinal: '0486521' },
          { indiceChance: 4, rangeInicio: '0576531', rangeFinal: '0586521' },
          { indiceChance: 5, rangeInicio: '0676531', rangeFinal: '0686521' },
          { indiceChance: 6, rangeInicio: '0776531', rangeFinal: '0786521' },
        ],
      },
      {
        origemParticipacao: 'DIGITAL',
        tipoCartela: 'DOZE_CHANCES',
        preco: '50.00',
        chances: [
          { indiceChance: 1, rangeInicio: '0851903', rangeFinal: '0861893' },
          { indiceChance: 2, rangeInicio: '0921903', rangeFinal: '0931893' },
          { indiceChance: 3, rangeInicio: '0991903', rangeFinal: '1001893' },
          { indiceChance: 4, rangeInicio: '1061903', rangeFinal: '1071893' },
          { indiceChance: 5, rangeInicio: '1131903', rangeFinal: '1141893' },
          { indiceChance: 6, rangeInicio: '1201903', rangeFinal: '1211893' },
          { indiceChance: 7, rangeInicio: '1271903', rangeFinal: '1281893' },
          { indiceChance: 8, rangeInicio: '1341903', rangeFinal: '1351893' },
          { indiceChance: 9, rangeInicio: '1411903', rangeFinal: '1421893' },
          { indiceChance: 10, rangeInicio: '1481903', rangeFinal: '1491893' },
          { indiceChance: 11, rangeInicio: '1551903', rangeFinal: '1561893' },
          { indiceChance: 12, rangeInicio: '1621903', rangeFinal: '1631893' },
        ],
      },
    ],
    description:
      'Detalhes dos ranges da edição por origem/tipo. Aceita formato flat (1 item por chance) e formato agrupado (`chances`) para representar preço por combo.',
  })
  @Transform(parseDetalhesInput)
  @Type(() => CreateEdicaoDetalheDto)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  detalhes: CreateEdicaoDetalheDto[];

  @ApiProperty({
    type: [CreateEdicaoPremioDto],
    description:
      'Prêmios da edição na ordem em que serão sorteados. A API deriva `qtdPremios` a partir deste array.',
  })
  @Transform(parsePremiosInput)
  @Type(() => CreateEdicaoPremioDto)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  premios: CreateEdicaoPremioDto[];
}
