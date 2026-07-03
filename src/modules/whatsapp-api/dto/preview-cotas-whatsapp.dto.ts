import { ApiHideProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
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
    description:
      'Quantidade de opções a pré-visualizar. Para compra unitária, representa cartelas simples; para combo, representa combos.',
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;

  @ApiHideProperty()
  @IsOptional()
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Quantidade de cartelas por opção (inteiro de 1 a 12). Informe 1 para compra unitária. Se omitida, assume 1.',
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
    description:
      'Direção de navegação: PROXIMO (avançar) ou ANTERIOR (voltar).',
  })
  @IsOptional()
  @IsEnum(['PROXIMO', 'ANTERIOR'])
  direcao?: 'PROXIMO' | 'ANTERIOR';
}
