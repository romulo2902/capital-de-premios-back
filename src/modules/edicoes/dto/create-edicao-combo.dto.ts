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
  ValidateIf,
} from 'class-validator';

const VALOR_COMBO_REGEX = /^\d+([.,]\d{1,2})?$/;

export class CreateEdicaoComboDto {
  @ApiProperty({
    enum: [OrigemParticipacao.DIGITAL],
    example: OrigemParticipacao.DIGITAL,
    description:
      'Origem do combo. Apenas DIGITAL — vendas POS reutilizam a configuração DIGITAL.',
  })
  @IsEnum(OrigemParticipacao)
  @IsIn([OrigemParticipacao.DIGITAL], {
    message: 'origemParticipacao em combos aceita apenas DIGITAL',
  })
  origemParticipacao: OrigemParticipacao;

  @ApiPropertyOptional({
    example: 2,
    description: 'Quantidade de cartelas deste combo (inteiro).',
  })
  @ValidateIf(
    (combo: CreateEdicaoComboDto) =>
      combo.quantidadeCartelas !== undefined || combo.tipoCartela === undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidadeCartelas?: number;

  @ApiHideProperty()
  @IsOptional()
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiProperty({
    example: '20.00',
    description:
      'Preço total do combo para a quantidade de cartelas informada. Aceita ponto ou vírgula como separador decimal.',
  })
  @IsString()
  @Matches(VALOR_COMBO_REGEX, {
    message: 'preco deve ser um valor monetário válido',
  })
  preco: string;
}
