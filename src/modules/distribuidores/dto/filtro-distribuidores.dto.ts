import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroDistribuidoresDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Joao',
    description: 'Busca por nome, CPF ou e-mail do distribuidor.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
