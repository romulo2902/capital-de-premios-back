import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

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

export class FiltroCartelasSenaClienteDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'uuid-da-edicao-sena' })
  @Transform(emptyQueryToUndefined)
  @IsOptional()
  @IsUUID('4')
  edicaoSenaId?: string;
}

export class FiltroCartelasSenaAdminDto extends PaginationQueryDto {
  @ApiProperty({ example: 'uuid-da-edicao-sena' })
  @Transform(emptyQueryToUndefined)
  @IsNotEmpty()
  @IsUUID('4')
  edicaoSenaId: string;
}
