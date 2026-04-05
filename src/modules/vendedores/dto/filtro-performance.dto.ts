import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class FiltroPerformanceDto {
  @ApiPropertyOptional({
    example: 'uuid-da-edicao',
    description: 'Filtrar por edição específica.',
  })
  @IsOptional()
  @IsUUID('4')
  edicaoId?: string;

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

  @ApiPropertyOptional({
    example: 'João',
    description: 'Busca por nome, e-mail ou CPF.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
