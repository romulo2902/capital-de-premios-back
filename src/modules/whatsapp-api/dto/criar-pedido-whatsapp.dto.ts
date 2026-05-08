import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  Type,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { TipoCartela } from '@prisma/client';

export class ComboSelecionadoWhatsappDto {
  @ApiProperty({
    example: '0001234',
    description: 'Número base do combo selecionado (7 dígitos com zeros à esquerda).',
  })
  @IsString()
  numeroBase: string;
}

/**
 * POST /whatsapp/pedidos
 *
 * Cria um pedido e já gera a cobrança PIX em uma única chamada.
 * O bot deve usar o `pixCopiaECola` retornado para enviar ao cliente via WhatsApp.
 */
export class CriarPedidoWhatsappDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID da edição/campanha ativa (obter em GET /whatsapp/campanhas/ativa).',
  })
  @IsUUID('4')
  edicaoId: string;

  @ApiProperty({
    example: 1,
    description: 'Quantidade de combos a comprar (mínimo 1).',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade: number;

  @ApiPropertyOptional({
    enum: TipoCartela,
    example: TipoCartela.SEIS_CHANCES,
    description:
      'Tipo de cartela escolhida. Alternativo a `quantidadeCartelas`. ' +
      'Se omitido, usa o tipo padrão da campanha.',
  })
  @ValidateIf(
    (dto: CriarPedidoWhatsappDto) =>
      dto.tipoCartela !== undefined || dto.quantidadeCartelas === undefined,
  )
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 6,
    description:
      'Quantidade de chances/cartelas do combo (1 a 12). Alias para `tipoCartela`. ' +
      'Use um ou outro, não ambos.',
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
    type: [ComboSelecionadoWhatsappDto],
    description:
      'Combos específicos escolhidos pelo cliente (opcional). ' +
      'Obtidos em POST /whatsapp/campanhas/:id/cotas/preview. ' +
      'Se omitido, o sistema seleciona automaticamente os melhores combos disponíveis.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboSelecionadoWhatsappDto)
  combosSelecionados?: ComboSelecionadoWhatsappDto[];
}
