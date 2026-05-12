import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { Type } from 'class-transformer';
import { FaixaPremiacao } from '@prisma/client';

export class CreatePremioSenaDto {
  @ApiProperty({ enum: FaixaPremiacao, example: FaixaPremiacao.QUADRA })
  @IsEnum(FaixaPremiacao)
  faixa: FaixaPremiacao;

  @ApiProperty({ example: 'Quadra — R$ 500,00' })
  @IsString()
  @IsNotEmpty()
  descricao: string;

  @ApiProperty({ example: 500.0 })
  @IsNumber()
  @Min(0)
  valor: number;
}

export class CreateComboSenaDto {
  @ApiProperty({ example: 'Pacote 3 cartelas' })
  @IsString()
  @IsNotEmpty()
  nome: string;

  @ApiProperty({ example: 3 })
  @IsNumber()
  @Min(2)
  quantidade: number;

  @ApiProperty({ example: 12.0, description: 'Preço total do combo (com desconto)' })
  @IsNumber()
  @Min(0)
  preco: number;
}

export class CreateEdicaoSenaDto {
  @ApiProperty({ example: '001', description: 'Número identificador da edição' })
  @IsString()
  @IsNotEmpty()
  numero: string;

  @ApiPropertyOptional({ example: 'Edição Especial Maio 2026' })
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiProperty({
    example: '2026-06-07T20:00',
    description: 'Data e hora do sorteio oficial da Mega-Sena (ISO 8601)',
  })
  @IsDateString()
  dataSorteioMegaSena: string;

  @ApiProperty({
    example: '2026-06-07T19:00',
    description: 'Data e hora de encerramento das compras',
  })
  @IsDateString()
  dataEncerramento: string;

  @ApiProperty({ example: 5.0, description: 'Valor unitário da cartela (R$)' })
  @IsNumber()
  @Min(0.01)
  valorCartela: number;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/banner.png', description: 'Preenchido automaticamente após upload S3 — não enviar manualmente' })
  @IsOptional()
  @IsString()
  imagemUrl?: string;

  @ApiProperty({
    type: [CreatePremioSenaDto],
    description: 'Faixas de premiação (QUADRA, QUINA, SENA, SENA_BONUS)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePremioSenaDto)
  premios: CreatePremioSenaDto[];

  @ApiPropertyOptional({ type: [CreateComboSenaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateComboSenaDto)
  combos?: CreateComboSenaDto[];
}
