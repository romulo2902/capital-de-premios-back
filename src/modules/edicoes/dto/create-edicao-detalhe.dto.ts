import { ApiProperty } from '@nestjs/swagger';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';

const RANGE_MINIMO_REGEX = /^\d{7,}$/;

export class CreateEdicaoDetalheDto {
  @ApiProperty({
    enum: OrigemParticipacao,
    example: OrigemParticipacao.DIGITAL,
    description:
      'Espécie/origem da participação no sorteio. Valores aceitos inicialmente: DIGITAL, FISICO e POS.',
  })
  @IsEnum(OrigemParticipacao)
  origemParticipacao: OrigemParticipacao;

  @ApiProperty({
    enum: TipoCartela,
    example: TipoCartela.UMA_CHANCE,
    description:
      'Tipo da cartela conforme a quantidade de chances. Ex.: UMA_CHANCE, DUAS_CHANCES, ... DOZE_CHANCES.',
  })
  @IsEnum(TipoCartela)
  tipoCartela: TipoCartela;

  @ApiProperty({
    example: '1000000',
    description:
      'Início do range numérico da cartela. Deve conter ao menos 7 dígitos.',
  })
  @IsString()
  @Matches(RANGE_MINIMO_REGEX, {
    message: 'rangeInicio deve possuir ao menos 7 dígitos numéricos',
  })
  rangeInicio: string;

  @ApiProperty({
    example: '1999999',
    description:
      'Fim do range numérico da cartela. Deve conter ao menos 7 dígitos.',
  })
  @IsString()
  @Matches(RANGE_MINIMO_REGEX, {
    message: 'rangeFinal deve possuir ao menos 7 dígitos numéricos',
  })
  rangeFinal: string;
}
