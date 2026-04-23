import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';

const VALOR_COMBO_REGEX = /^\d+([.,]\d{1,2})?$/;

export class CreateEdicaoComboDto {
  @ApiProperty({
    enum: [OrigemParticipacao.DIGITAL, OrigemParticipacao.POS],
    example: OrigemParticipacao.DIGITAL,
    description: 'Origem do combo (ex.: DIGITAL ou POS).',
  })
  @IsEnum(OrigemParticipacao)
  @IsIn([OrigemParticipacao.DIGITAL, OrigemParticipacao.POS], {
    message: 'origemParticipacao em combos aceita apenas DIGITAL ou POS',
  })
  origemParticipacao: OrigemParticipacao;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Quantidade de cartelas/chances deste combo (1 a 12). Novo formato recomendado.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  quantidadeCartelas?: number;

  @ApiPropertyOptional({
    enum: TipoCartela,
    example: TipoCartela.DUAS_CHANCES,
    description:
      'Tipo do combo conforme quantidade de chances (legado compatível). Se `quantidadeCartelas` também for enviado, ambos devem ser equivalentes.',
  })
  @ValidateIf(
    (combo: CreateEdicaoComboDto) =>
      combo.tipoCartela !== undefined || combo.quantidadeCartelas === undefined,
  )
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiProperty({
    example: '20.00',
    description:
      'Preço do combo. Aceita ponto ou vírgula como separador decimal.',
  })
  @IsString()
  @Matches(VALOR_COMBO_REGEX, {
    message: 'preco deve ser um valor monetário válido',
  })
  preco: string;
}
