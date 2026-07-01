import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
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
  MinLength,
  ValidateIf,
} from 'class-validator';

const VALOR_COMBO_REGEX = /^\d+([.,]\d{1,2})?$/;
const RANGE_REGEX = /^\d{7,}$/;

export class CreateEdicaoComboDto {
  @ApiProperty({
    enum: [OrigemParticipacao.DIGITAL],
    example: OrigemParticipacao.DIGITAL,
    description: 'Origem do combo. Apenas DIGITAL.',
  })
  @IsEnum(OrigemParticipacao)
  @IsIn([OrigemParticipacao.DIGITAL], {
    message: 'origemParticipacao em combos aceita apenas DIGITAL',
  })
  origemParticipacao: OrigemParticipacao;

  @ApiPropertyOptional({
    example: 2,
    description: 'Quantidade de cartelas deste combo (inteiro entre 1 e 12).',
  })
  @ValidateIf(
    (combo: CreateEdicaoComboDto) =>
      combo.quantidadeCartelas !== undefined || combo.tipoCartela === undefined,
  )
  @Type(() => Number)
  @IsInt({ message: 'quantidadeCartelas deve ser um número inteiro' })
  @Min(1, { message: 'quantidadeCartelas deve ser no mínimo 1' })
  @Max(12, { message: 'quantidadeCartelas deve ser no máximo 12' })
  quantidadeCartelas?: number;

  @ApiHideProperty()
  @IsOptional()
  @IsEnum(TipoCartela, { message: 'tipoCartela inválido' })
  tipoCartela?: TipoCartela;

  @ApiProperty({
    example: '20.00',
    description:
      'Preço total do combo. Aceita ponto ou vírgula como separador decimal.',
  })
  @IsString()
  @Matches(VALOR_COMBO_REGEX, {
    message: 'preco deve ser um valor monetário válido',
  })
  preco: string;

  @ApiProperty({
    example: '0951000',
    description:
      'Número inicial do range deste combo. Mínimo 7 dígitos. Os bilhetes vendidos por este combo virão exclusivamente deste intervalo.',
  })
  @IsString({ message: 'rangeInicio deve ser um texto' })
  @MinLength(7, { message: 'rangeInicio deve ter no mínimo 7 dígitos' })
  @Matches(RANGE_REGEX, { message: 'rangeInicio deve conter apenas dígitos' })
  rangeInicio: string;

  @ApiProperty({
    example: '0952000',
    description:
      'Número final do range deste combo. Mínimo 7 dígitos. Deve ser maior ou igual ao rangeInicio.',
  })
  @IsString({ message: 'rangeFinal deve ser um texto' })
  @MinLength(7, { message: 'rangeFinal deve ter no mínimo 7 dígitos' })
  @Matches(RANGE_REGEX, { message: 'rangeFinal deve conter apenas dígitos' })
  rangeFinal: string;
}
