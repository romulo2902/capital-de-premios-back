import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroRangesDto extends PaginationQueryDto {
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
}

