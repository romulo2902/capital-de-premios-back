import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrigemParticipacao } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const RANGE_MINIMO_REGEX = /^\d{7,}$/;

export class CreateEdicaoDetalheDto {
  @ApiPropertyOptional({
    enum: [OrigemParticipacao.DIGITAL, OrigemParticipacao.FISICO],
    example: OrigemParticipacao.DIGITAL,
    description:
      'Tipo de range da edição. Aceita apenas DIGITAL ou FISICO.',
  })
  @IsEnum(OrigemParticipacao)
  @IsIn([OrigemParticipacao.DIGITAL, OrigemParticipacao.FISICO], {
    message: 'origemParticipacao em detalhes aceita apenas DIGITAL ou FISICO',
  })
  origemParticipacao: OrigemParticipacao;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Índice do setor/range dentro da origem (1, 2, 3, ...). Quando omitido, a API usa a ordem de envio.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'indiceRange deve ser um número inteiro' })
  @Min(1, { message: 'indiceRange deve ser no mínimo 1' })
  indiceRange?: number;

  @ApiProperty({
    example: '1000000',
    description:
      'Início do range base da origem dentro da matriz. Deve conter ao menos 7 dígitos.',
  })
  @IsString()
  @Matches(RANGE_MINIMO_REGEX, {
    message: 'rangeInicio deve possuir ao menos 7 dígitos numéricos',
  })
  rangeInicio: string;

  @ApiProperty({
    example: '1999999',
    description:
      'Fim do range base da origem dentro da matriz. Deve conter ao menos 7 dígitos.',
  })
  @IsString()
  @Matches(RANGE_MINIMO_REGEX, {
    message: 'rangeFinal deve possuir ao menos 7 dígitos numéricos',
  })
  rangeFinal: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Campo legado sem efeito.',
  })
  @IsOptional()
  quantidadeSetores?: never;
}
