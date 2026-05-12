import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { StatusVendaSena } from '@prisma/client';

export class FiltroVendasSenaDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'uuid-da-edicao-sena' })
  @IsOptional()
  @IsUUID('4')
  edicaoSenaId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-cliente' })
  @IsOptional()
  @IsUUID('4')
  clienteId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-vendedor' })
  @IsOptional()
  @IsUUID('4')
  vendedorId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-distribuidor' })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;

  @ApiPropertyOptional({ enum: StatusVendaSena })
  @IsOptional()
  @IsEnum(StatusVendaSena)
  status?: StatusVendaSena;

  @ApiPropertyOptional({ example: '12345678900', description: 'CPF do cliente' })
  @IsOptional()
  @IsString()
  cpf?: string;
}
