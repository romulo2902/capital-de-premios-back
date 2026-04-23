import { ApiProperty } from '@nestjs/swagger';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
import { IsEnum, IsIn, IsString, Matches } from 'class-validator';

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

  @ApiProperty({
    enum: TipoCartela,
    example: TipoCartela.DUAS_CHANCES,
    description:
      'Tipo do combo conforme quantidade de chances (ex.: UMA_CHANCE, DUAS_CHANCES, ...).',
  })
  @IsEnum(TipoCartela)
  tipoCartela: TipoCartela;

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
