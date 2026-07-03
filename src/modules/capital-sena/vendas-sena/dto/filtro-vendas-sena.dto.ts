import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';
import { StatusVendaSena } from '@prisma/client';

const emptyQueryToUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  if (
    normalizedValue === '' ||
    normalizedValue.toLowerCase() === 'null' ||
    normalizedValue.toLowerCase() === 'undefined'
  ) {
    return undefined;
  }

  return normalizedValue;
};

export class FiltroVendasSenaDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'uuid-da-edicao-sena' })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsUUID('4')
  edicaoSenaId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-cliente' })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsUUID('4')
  clienteId?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-cliente',
    description: 'Alias compatível de clienteId.',
  })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-vendedor' })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsUUID('4')
  vendedorId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-distribuidor' })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;

  @ApiPropertyOptional({ enum: StatusVendaSena })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsEnum(StatusVendaSena)
  status?: StatusVendaSena;

  @ApiPropertyOptional({ example: '12345678900', description: 'CPF do cliente' })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsString()
  cpf?: string;
}
