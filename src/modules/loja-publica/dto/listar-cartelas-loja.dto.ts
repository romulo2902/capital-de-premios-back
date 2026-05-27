import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';

export enum DirecaoCartelaLoja {
  PROXIMO = 'PROXIMO',
  ANTERIOR = 'ANTERIOR',
}

export class ListarCartelasLojaDto {
  @ApiHideProperty()
  @IsOptional()
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 6,
    description:
      'Quantidade de cartelas/chances a serem listadas. Se omitida, assume 1.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  quantidadeCartelas?: number;

  @ApiPropertyOptional({
    enum: [OrigemParticipacao.DIGITAL],
    example: OrigemParticipacao.DIGITAL,
    description: 'Origem da participação. Na loja pública, o padrão é DIGITAL.',
  })
  @IsOptional()
  @IsEnum(OrigemParticipacao)
  @IsIn([OrigemParticipacao.DIGITAL], {
    message: 'origemParticipacao aceita apenas DIGITAL',
  })
  origemParticipacao?: OrigemParticipacao;


  @ApiPropertyOptional({
    example: 12,
    description:
      'Quantidade máxima de cartelas retornadas por página. Se omitido, retorna 5.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Índice do range para listar cartelas unitárias específicas (ex: 1 para Range 1, 2 para Range 2).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  indiceRange?: number;
}
