import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModoSelecaoSena, TipoPagamento } from '@prisma/client';

export class ItemCartelaSenaDto {
  @ApiPropertyOptional({
    type: [Number],
    example: [3, 12, 24, 37, 45, 58],
    description:
      '6 números escolhidos (1–60). Obrigatório se modoSelecao=MANUAL. Omita para SURPRESINHA.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(60, { each: true })
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  numeros?: number[];

  @ApiProperty({ enum: ModoSelecaoSena, example: ModoSelecaoSena.MANUAL })
  @IsEnum(ModoSelecaoSena)
  modoSelecao: ModoSelecaoSena;
}

export class CreateVendaSenaDto {
  @ApiProperty({ example: 'uuid-da-edicao-sena' })
  @IsUUID('4')
  edicaoSenaId: string;

  @ApiProperty({
    type: [ItemCartelaSenaDto],
    description: 'Lista de cartelas a comprar. Use junto com cartelas individuais.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemCartelaSenaDto)
  @ArrayMinSize(1)
  cartelas: ItemCartelaSenaDto[];

  @ApiPropertyOptional({ example: 'uuid-do-combo' })
  @IsOptional()
  @IsUUID('4')
  comboSenaId?: string;

  @ApiProperty({ enum: TipoPagamento, example: TipoPagamento.PIX })
  @IsEnum(TipoPagamento)
  tipoPagamento: TipoPagamento;

  // Dados do cliente
  @ApiProperty({ example: '12345678900' })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @MinLength(2)
  nome: string;

  @ApiProperty({ example: '(11) 99999-9999' })
  @IsString()
  telefone: string;

  @ApiPropertyOptional({ example: 'maria@email.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  // Origem da venda
  @ApiPropertyOptional({ example: 'uuid-do-vendedor' })
  @IsOptional()
  @IsUUID('4')
  vendedorId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-distribuidor' })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;
}
