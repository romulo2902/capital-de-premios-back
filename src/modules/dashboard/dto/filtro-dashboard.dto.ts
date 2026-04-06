import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsISO8601, IsOptional, IsString } from 'class-validator';

export class DashboardFilterDto {
  @ApiPropertyOptional({
    example: 'uuid-da-edicao1,uuid-da-edicao2',
    description: 'Array ou string separada por vírgula de IDs de edições.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const values = Array.isArray(value) ? value : [value];

    return values
      .flatMap((item) =>
        typeof item === 'string' ? item.split(',') : [String(item)],
      )
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  })
  @IsArray()
  @IsString({ each: true })
  edicaoIds?: string[];

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
