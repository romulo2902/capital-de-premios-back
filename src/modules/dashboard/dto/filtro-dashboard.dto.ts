import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsOptional, IsString } from 'class-validator';

export class DashboardFilterDto {
  @ApiPropertyOptional({
    example: 'uuid-da-edicao1,uuid-da-edicao2',
    description: 'Array ou string separada por vírgula de IDs de edições.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  edicaoIds?: string[] | string;

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
