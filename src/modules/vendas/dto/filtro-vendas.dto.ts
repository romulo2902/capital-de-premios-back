import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { StatusVenda, TipoPagamento } from '@prisma/client';

export class FiltroVendasDto {
  @ApiPropertyOptional({
    example: 'uuid-da-edicao',
    description: 'Filtrar por edição.',
  })
  @IsOptional()
  @IsUUID('4')
  edicaoId?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-cliente',
    description: 'Filtrar por cliente.',
  })
  @IsOptional()
  @IsUUID('4')
  clienteId?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-vendedor',
    description: 'Filtrar por vendedor.',
  })
  @IsOptional()
  @IsUUID('4')
  vendedorId?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-distribuidor',
    description: 'Filtrar por distribuidor.',
  })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;

  @ApiPropertyOptional({
    enum: StatusVenda,
    description: 'Filtrar por status.',
  })
  @IsOptional()
  @IsEnum(StatusVenda)
  status?: StatusVenda;

  @ApiPropertyOptional({
    enum: TipoPagamento,
    description: 'Filtrar por tipo de pagamento.',
  })
  @IsOptional()
  @IsEnum(TipoPagamento)
  tipoPagamento?: TipoPagamento;

  @ApiPropertyOptional({
    example: 'Romulo',
    description: 'Busca textual por nome ou CPF do cliente.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Data de início do período (ISO 8601).',
  })
  @IsOptional()
  @IsISO8601()
  dataInicio?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Data de fim do período (ISO 8601).',
  })
  @IsOptional()
  @IsISO8601()
  dataFim?: string;
}
