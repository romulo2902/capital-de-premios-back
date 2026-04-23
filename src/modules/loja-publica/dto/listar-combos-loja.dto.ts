import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export enum DirecaoComboLoja {
  PROXIMO = 'PROXIMO',
  ANTERIOR = 'ANTERIOR',
}

export class ListarCombosLojaDto {
  @ApiProperty({
    enum: TipoCartela,
    example: TipoCartela.SEIS_CHANCES,
    description: 'Tipo de cartela/combinação que o cliente deseja navegar.',
  })
  @IsEnum(TipoCartela)
  tipoCartela: TipoCartela;

  @ApiPropertyOptional({
    enum: [OrigemParticipacao.DIGITAL, OrigemParticipacao.POS],
    example: OrigemParticipacao.DIGITAL,
    description: 'Origem da participação. Na loja pública, o padrão é DIGITAL.',
  })
  @IsOptional()
  @IsEnum(OrigemParticipacao)
  @IsIn([OrigemParticipacao.DIGITAL, OrigemParticipacao.POS], {
    message: 'origemParticipacao aceita apenas DIGITAL ou POS',
  })
  origemParticipacao?: OrigemParticipacao;

  @ApiPropertyOptional({
    example: '0276145',
    description:
      'Número base do combo atual. Quando informado, a API navega a sequência a partir dele.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, {
    message: 'cursorNumeroBase deve conter apenas dígitos',
  })
  cursorNumeroBase?: string;

  @ApiPropertyOptional({
    enum: DirecaoComboLoja,
    example: DirecaoComboLoja.PROXIMO,
    description: 'Direção da navegação na sequência determinística dos combos.',
  })
  @IsOptional()
  @IsEnum(DirecaoComboLoja)
  direcao?: DirecaoComboLoja;

  @ApiPropertyOptional({
    example: 12,
    deprecated: true,
    description:
      'Ignorado: a API sempre retorna apenas 1 combo por requisição (navegação simplificada).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number;
}
