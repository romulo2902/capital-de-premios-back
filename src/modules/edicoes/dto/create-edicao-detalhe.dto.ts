import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

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
      'Início do range deste bilhete/chance dentro da matriz. No modo manual (2/6/12), envie um detalhe por chance. Deve conter ao menos 7 dígitos.',
  })
  @IsString()
  @Matches(RANGE_MINIMO_REGEX, {
    message: 'rangeInicio deve possuir ao menos 7 dígitos numéricos',
  })
  rangeInicio: string;

  @ApiProperty({
    example: '1999999',
    description:
      'Fim do range deste bilhete/chance dentro da matriz. No modo manual (2/6/12), todos os ranges do mesmo tipo devem ter o mesmo tamanho para manter o pareamento. Deve conter ao menos 7 dígitos.',
  })
  @IsString()
  @Matches(RANGE_MINIMO_REGEX, {
    message: 'rangeFinal deve possuir ao menos 7 dígitos numéricos',
  })
  rangeFinal: string;

  @ApiPropertyOptional({
    example: '10.00',
    description:
      'Preço do combo deste tipo de cartela (não por bilhete). Em grupos com múltiplas chances, pode ser informado apenas em um dos detalhes; quando informado em mais de um, deve ser igual em todos. Se omitido no grupo, usa valorCartela da edição.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? value : String(value),
  )
  @IsString()
  @Matches(/^\d+([.,]\d{1,2})?$/, {
    message: 'preco deve ser um valor monetário válido',
  })
  preco?: string;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Índice explícito da chance (1ª, 2ª, ... 12ª). Se usar `indiceChance` em um range do grupo, informe em todos do mesmo grupo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  indiceChance?: number;
}
