import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { StatusMaquininha } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Filtros da listagem de maquininhas.
 *
 * `distribuidorId` só tem efeito para ADMIN: para distribuidor e vendedor o
 * recorte já vem do token e o parâmetro é ignorado.
 */
export class FiltroMaquininhasDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'balcão',
    description: 'Busca por número de série, apelido ou operadora.',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: StatusMaquininha,
    example: StatusMaquininha.ATIVA,
    description: 'Filtrar por situação do aparelho.',
  })
  @IsOptional()
  @IsEnum(StatusMaquininha)
  status?: StatusMaquininha;

  @ApiPropertyOptional({
    example: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
    description:
      'Filtrar por rede. Só tem efeito para ADMIN — ignorado nos demais perfis.',
  })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;
}
