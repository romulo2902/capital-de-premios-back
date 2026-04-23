import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { OrigemParticipacao, TipoCartela } from '@prisma/client';

export enum DirecaoComboLoja {
  PROXIMO = 'PROXIMO',
  ANTERIOR = 'ANTERIOR',
}

export class ListarCombosLojaDto {
  @ApiPropertyOptional({
    enum: TipoCartela,
    example: TipoCartela.SEIS_CHANCES,
    description:
      'Tipo de cartela/combinação que o cliente deseja navegar (legado compatível com `quantidadeCartelas`).',
  })
  @ValidateIf(
    (dto: ListarCombosLojaDto) =>
      dto.tipoCartela !== undefined || dto.quantidadeCartelas === undefined,
  )
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 6,
    description:
      'Quantidade de cartelas/chances do combo (1 a 12). Alias para `tipoCartela`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  quantidadeCartelas?: number;

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
