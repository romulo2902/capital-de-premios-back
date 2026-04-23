import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Transform,
  TransformFnParams,
  Type,
} from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DestinoEdicao } from '@prisma/client';
import { CreateEdicaoComboDto } from './create-edicao-combo.dto';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';
import {
  parseCombosInput,
  parseDetalhesInput,
  parsePremiosInput,
} from './edicao-input-parsers.util';
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

export class CreateEdicaoDto {
  @ApiProperty({
    example: 'ABC-2026-001',
    description:
      'Identificador de exibição da edição/sorteio (texto livre, não é o ID interno da entidade).',
  })
  @IsString()
  numero: string;

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

  @ApiPropertyOptional({
    example: '10.00',
    description:
      'Valor base de fallback da cartela. Quando omitido, a API deriva a partir dos combos cadastrados.',
  })
  @IsOptional()
  @IsString()
  @Matches(VALOR_CARTELA_REGEX, {
    message: 'valorCartela deve ser um valor monetário válido',
  })
  valorCartela?: string;

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
    type: 'object',
    additionalProperties: {
      type: 'array',
      items: {
        type: 'object',
      },
    },
    example: {
      DIGITAL: [
        {
          indiceRange: 1,
          rangeInicio: '0000001',
          rangeFinal: '0001000',
        },
        {
          indiceRange: 2,
          rangeInicio: '0001001',
          rangeFinal: '0002000',
        },
      ],
      FISICO: [
        {
          indiceRange: 1,
          rangeInicio: '0000001',
          rangeFinal: '0000500',
        },
      ],
    },
    description:
      'Ranges por setor da edição. Aceita objeto agrupado por origem (`DIGITAL` e `FISICO`) ou array plano legado. Cada item representa um setor/range individual.',
  })
  @Transform(parseDetalhesInput)
  @Type(() => CreateEdicaoDetalheDto)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  detalhes: CreateEdicaoDetalheDto[];

  @ApiProperty({
    type: [CreateEdicaoComboDto],
    example: [
      {
        origemParticipacao: 'DIGITAL',
        tipoCartela: 'UMA_CHANCE',
        preco: '10.00',
      },
      {
        origemParticipacao: 'DIGITAL',
        tipoCartela: 'DUAS_CHANCES',
        preco: '20.00',
      },
      {
        origemParticipacao: 'POS',
        tipoCartela: 'DUAS_CHANCES',
        preco: '22.00',
      },
    ],
    description:
      'Combos da edição com preço por origem e tipo de cartela/chances.',
  })
  @Transform(parseCombosInput)
  @Type(() => CreateEdicaoComboDto)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  combos: CreateEdicaoComboDto[];

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
