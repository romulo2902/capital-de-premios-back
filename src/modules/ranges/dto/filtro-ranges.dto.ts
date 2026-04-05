import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class FiltroRangesDto {
  @ApiPropertyOptional({ example: 1, description: 'Página da listagem' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Quantidade por página' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: '17e2520d-97ae-4cd1-8fa6-a3c906c962b5',
    description: 'Filtrar ranges pertencentes ao intervalo de uma edição',
  })
  @IsOptional()
  @IsUUID('4')
  edicaoId?: string;

  @ApiPropertyOptional({
    example: 3000000,
    description: 'Número inicial do filtro de ranges',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  numeroInicio?: number;

  @ApiPropertyOptional({
    example: 3000099,
    description: 'Número final do filtro de ranges',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  numeroFim?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar por disponibilidade do range',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  disponivel?: boolean;
}
