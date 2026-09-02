import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Filtros da listagem de vendedores no POS.
 *
 * Não expõe `distribuidorId`: o recorte da rede vem sempre do token do operador.
 */
export class FiltroPosVendedoresDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Maria',
    description: 'Busca por nome, CPF ou e-mail do vendedor da própria rede.',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
