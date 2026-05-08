import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * POST /whatsapp/pedidos
 *
 * Cria um pedido e gera a cobrança PIX automaticamente.
 *
 * O bot informa apenas a edição e a quantidade de cartelas desejada.
 * O sistema seleciona o tipo de cartela disponível na campanha
 * e aleatorizará os números na aprovação do pagamento.
 */
export class CriarPedidoWhatsappDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'ID da edição/campanha ativa (obtido em GET /whatsapp/campanhas/ativa).',
  })
  @IsUUID('4')
  edicaoId: string;

  @ApiProperty({
    example: 2,
    description: 'Quantidade de cartelas a comprar (mínimo 1).',
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade: number;
}
