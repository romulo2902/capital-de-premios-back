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
import { DestinoEdicao, StatusEdicao } from '@prisma/client';
import { CreateEdicaoDetalheDto } from './create-edicao-detalhe.dto';

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

const normalizeNullableString = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  return normalizedValue === '' ? null : normalizedValue;
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

  @ApiProperty({
    example: 4,
    description: 'Quantidade de prêmios da edição.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qtdPremios: number;

  @ApiPropertyOptional({
    enum: DestinoEdicao,
    example: DestinoEdicao.AMBOS,
    description:
      'Destino da edição/cartela: site, loja física ou ambos. Se omitido, a API infere a partir dos detalhes enviados.',
  })
  @IsOptional()
  @IsEnum(DestinoEdicao)
  destino?: DestinoEdicao;

  @ApiPropertyOptional({
    example: 'https://cdn.capitalpremios.com.br/edicoes/125/banner.jpg',
    description:
      'URL pública da imagem principal da cartela/sorteio. Quando um arquivo `imagem` for enviado em multipart, a API sobe o arquivo para o S3 e preenche este campo automaticamente.',
  })
  @Transform(normalizeNullableString)
  @IsOptional()
  @IsString()
  imagemUrl?: string | null;

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

  @ApiPropertyOptional({
    enum: StatusEdicao,
    example: StatusEdicao.RASCUNHO,
    description:
      'Status enviado pelo admin. Na criação, apenas RASCUNHO é aceito; ativação/desativação ocorre por endpoints dedicados.',
  })
  @IsOptional()
  @IsEnum(StatusEdicao)
  status?: StatusEdicao;

  @ApiProperty({
    type: [CreateEdicaoDetalheDto],
    description:
      'Detalhes dos ranges da edição. Permite separar participação DIGITAL, FISICO e POS no mesmo sorteio.',
  })
  @Transform(parseDetalhesInput)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  detalhes: CreateEdicaoDetalheDto[];
}
