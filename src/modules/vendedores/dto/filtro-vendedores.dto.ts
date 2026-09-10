import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroVendedoresDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Joao',
    description: 'Busca por nome, CPF ou e-mail do vendedor.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-distribuidor',
    description: 'Filtrar vendedores de um distribuidor.',
  })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Apenas auto-cadastros aguardando aprovação (`aprovadoEm` nulo). ' +
      'Omitido, a lista traz todos.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  pendentes?: boolean;
}
