import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { FaixaPremiacao } from '@prisma/client';

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

const parsePremiosInput = ({ value }: TransformFnParams): unknown =>
  parseJsonInput(value, 'premios');

const parseCombosInput = ({ value }: TransformFnParams): unknown =>
  parseJsonInput(value, 'combos');

export class CreatePremioSenaDto {
  @ApiProperty({ enum: FaixaPremiacao, example: FaixaPremiacao.QUADRA })
  @IsEnum(FaixaPremiacao, { message: 'faixa deve ser QUADRA, QUINA, SENA ou SENA_BONUS' })
  faixa: FaixaPremiacao;

  @ApiProperty({ example: 'Quadra — R$ 500,00' })
  @IsString({ message: 'descricao deve ser um texto' })
  @IsNotEmpty({ message: 'descricao não pode ser vazio' })
  descricao: string;

  @ApiProperty({ example: 500.0 })
  @IsNumber({}, { message: 'valor deve ser um número' })
  @Min(0, { message: 'valor deve ser maior ou igual a 0' })
  valor: number;

  @ApiPropertyOptional({
    example: 'data:image/png;base64,...',
    description:
      'Conteúdo da imagem do prêmio em base64 (incluindo o prefixo data:image). Se enviado, a API faz upload para o S3.',
  })
  @IsOptional()
  @IsString({ message: 'imagemBase64 deve ser um texto' })
  imagemBase64?: string;
}

export class CreateComboSenaDto {
  @ApiProperty({ example: 'Pacote 3 cartelas' })
  @IsString({ message: 'nome deve ser um texto' })
  @IsNotEmpty({ message: 'nome não pode ser vazio' })
  nome: string;

  @ApiProperty({ example: 3 })
  @IsNumber({}, { message: 'quantidade deve ser um número' })
  @Min(2, { message: 'quantidade deve ser no mínimo 2' })
  quantidade: number;

  @ApiProperty({
    example: 12.0,
    description: 'Preço total do combo (com desconto)',
  })
  @IsNumber({}, { message: 'preco deve ser um número' })
  @Min(0, { message: 'preco deve ser maior ou igual a 0' })
  preco: number;
}

export class CreateEdicaoSenaDto {
  @ApiProperty({
    example: '001',
    description: 'Número identificador da edição',
  })
  @IsString({ message: 'numero deve ser um texto' })
  @IsNotEmpty({ message: 'numero não pode ser vazio' })
  numero: string;

  @ApiPropertyOptional({ example: 'Edição Especial Maio 2026' })
  @IsOptional()
  @IsString({ message: 'descricao deve ser um texto' })
  descricao?: string;

  @ApiProperty({
    example: '2026-06-07T20:00',
    description: 'Data e hora do sorteio oficial da Mega-Sena (ISO 8601)',
  })
  @IsDateString({}, { message: 'dataSorteioMegaSena deve ser uma data válida no formato ISO 8601' })
  dataSorteioMegaSena: string;

  @ApiProperty({
    example: '2026-06-07T19:00',
    description: 'Data e hora de encerramento das compras',
  })
  @IsDateString({}, { message: 'dataEncerramento deve ser uma data válida no formato ISO 8601' })
  dataEncerramento: string;

  @ApiProperty({ example: 5.0, description: 'Valor unitário da cartela (R$)' })
  @IsNumber({}, { message: 'valorCartela deve ser um número' })
  @Min(0.01, { message: 'valorCartela deve ser no mínimo 0.01' })
  valorCartela: number;

  @ApiPropertyOptional({
    example: 'data:image/png;base64,...',
    description:
      'Conteúdo da imagem principal da edição em base64 (incluindo o prefixo data:image).',
  })
  @IsOptional()
  @IsString({ message: 'imagemBase64 deve ser um texto' })
  imagemBase64?: string;

  @ApiProperty({
    type: [CreatePremioSenaDto],
    description: 'Faixas de premiação (QUADRA, QUINA, SENA, SENA_BONUS)',
  })
  @Transform(parsePremiosInput)
  @IsArray({ message: 'premios deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => CreatePremioSenaDto)
  premios: CreatePremioSenaDto[];

  @ApiPropertyOptional({ type: [CreateComboSenaDto] })
  @Transform(parseCombosInput)
  @IsOptional()
  @IsArray({ message: 'combos deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => CreateComboSenaDto)
  combos?: CreateComboSenaDto[];
}
