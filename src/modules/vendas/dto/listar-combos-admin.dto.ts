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
    description: 'Tipo de cartela/combinação a navegar.',
  })
  @IsOptional()
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

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
