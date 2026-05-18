import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
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
  ValidateNested,
} from 'class-validator';
import { TipoCartela } from '@prisma/client';
import { Type } from 'class-transformer';

export class ComboSelecionadoWhatsappDto {
  @ApiProperty({
    example: '0001234',
    description:
      'Número base do combo selecionado (7 dígitos com zeros à esquerda).',
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
    description:
      'ID da edição/campanha ativa (obter em GET /whatsapp/campanhas/ativa).',
  })
  @IsUUID('4')
  edicaoId: string;

  @ApiProperty({
    example: 1,
    description:
      'Quantidade de itens a comprar. Para compra unitária, representa a quantidade de cartelas simples. Para combo, representa a quantidade de combos.',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade: number;

  @ApiHideProperty()
  @IsOptional()
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Quantidade de cartelas por item (inteiro de 1 a 12). Informe 1 para compra unitária. Se omitida, assume 1.',
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
      'Combos específicos escolhidos pelo cliente (opcional, use apenas quando quantidadeCartelas for maior que 1). ' +
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
