import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroDistribuidoresDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Joao',
    description: 'Busca por nome, CPF ou e-mail do distribuidor.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Lista **apenas** os distribuidores excluídos, em vez de somá-los à ' +
      'listagem normal. Omitido, os excluídos não aparecem.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  excluidos?: boolean;
}
