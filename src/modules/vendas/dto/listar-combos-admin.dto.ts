import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';

export enum DirecaoComboAdmin {
  PROXIMO = 'PROXIMO',
  ANTERIOR = 'ANTERIOR',
}

export class ListarCombosAdminDto {
  @ApiPropertyOptional({
    enum: TipoCartela,
    example: TipoCartela.SEIS_CHANCES,
    description:
      'Tipo de cartela/combinação a navegar (legado compatível com `quantidadeCartelas`).',
  })
  @IsOptional()
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
    enum: OrigemParticipacao,
    example: OrigemParticipacao.DIGITAL,
    description: 'Origem da participação. Padrão: DIGITAL.',
  })
  @IsOptional()
  @IsEnum(OrigemParticipacao)
  origemParticipacao?: OrigemParticipacao;

  @ApiPropertyOptional({
    example: '0276145',
    description: 'Número base do combo atual para usar de cursor.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, {
    message: 'cursorNumeroBase deve conter apenas dígitos',
  })
  cursorNumeroBase?: string;

  @ApiPropertyOptional({
    enum: DirecaoComboAdmin,
    example: DirecaoComboAdmin.PROXIMO,
    description: 'Direção da navegação na sequência de combos.',
  })
  @IsOptional()
  @IsEnum(DirecaoComboAdmin)
  direcao?: DirecaoComboAdmin;

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
