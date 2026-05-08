import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TipoCartela } from '@prisma/client';
import { Type } from 'class-transformer';

/**
 * POST /whatsapp/campanhas/:id/cotas/preview
 *
 * Gera uma prévia dos combos/cotas disponíveis para a campanha ativa,
 * **sem reservar** nenhum número. Ideal para o bot mostrar as opções
 * antes do cliente confirmar a compra.
 */
export class PreviewCotasWhatsappDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Quantidade de combos a pré-visualizar (default: 1).',
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;

  @ApiPropertyOptional({
    enum: TipoCartela,
    example: TipoCartela.SEIS_CHANCES,
    description:
      'Tipo de cartela para o preview. Alternativo a `quantidadeCartelas`.',
  })
  @ValidateIf(
    (dto: PreviewCotasWhatsappDto) =>
      dto.tipoCartela !== undefined || dto.quantidadeCartelas === undefined,
  )
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 6,
    description: 'Quantidade de chances do combo (1 a 12). Alias para `tipoCartela`.',
    minimum: 1,
    maximum: 12,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  quantidadeCartelas?: number;

  @ApiPropertyOptional({
    example: '0001234',
    description:
      'Cursor de navegação — número base do último combo visualizado. ' +
      'Use para paginar/navegar para o próximo grupo de combos.',
  })
  @IsOptional()
  cursorNumeroBase?: string;

  @ApiPropertyOptional({
    enum: ['PROXIMO', 'ANTERIOR'],
    example: 'PROXIMO',
    description: 'Direção de navegação: PROXIMO (avançar) ou ANTERIOR (voltar).',
  })
  @IsOptional()
  @IsEnum(['PROXIMO', 'ANTERIOR'])
  direcao?: 'PROXIMO' | 'ANTERIOR';
}
