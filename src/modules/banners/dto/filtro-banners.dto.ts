import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoBanner } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

const parseBooleanQuery = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return value;
};

export class FiltroBannersDto {
  @ApiPropertyOptional({
    enum: TipoBanner,
    description: 'Filtrar por produto.',
  })
  @IsOptional()
  @IsEnum(TipoBanner)
  tipo?: TipoBanner;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Filtrar por status ativo/inativo.',
  })
  @Transform(parseBooleanQuery)
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
