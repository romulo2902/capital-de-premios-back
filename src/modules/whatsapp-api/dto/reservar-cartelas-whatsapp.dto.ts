import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * POST /whatsapp/campanhas/:id/reservas
 *
 * Mesmo esquema de reserva usado no POS (`POST /pos/edicoes/:edicaoId/reservas`):
 * marca os números escolhidos como pré-compra por 5 minutos para o cliente
 * autenticado, evitando que outro canal (loja, POS, outro cliente WhatsApp)
 * venda a mesma cartela enquanto o bot finaliza o pedido.
 */
export class ReservarCartelasWhatsappDto {
  @ApiProperty({
    type: [String],
    example: ['0001234', '0002345', '0003456'],
    description:
      'Números das cartelas/bilhetes selecionados pelo cliente (7 dígitos). ' +
      'Para combo, envie todos os números de bilhetes.numero retornados para o combo escolhido em ' +
      'POST /whatsapp/campanhas/:id/cotas/preview.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  cartelas: string[];
}
