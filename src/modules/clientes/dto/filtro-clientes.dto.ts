import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class FiltroClientesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Maria',
    description: 'Busca por nome, CPF, telefone ou e-mail.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-vendedor',
    description: 'Filtrar clientes vinculados a um vendedor.',
  })
  @IsOptional()
  @IsUUID('4')
  vendedorId?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-distribuidor',
    description: 'Filtrar clientes vinculados a um distribuidor.',
  })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;
}
