import { OmitType } from '@nestjs/swagger';
import { CreateVendaSenaDto } from '../../capital-sena/vendas-sena/dto/create-venda-sena.dto';

/**
 * POST /whatsapp/sena/pedidos
 *
 * Cria um pedido Capital Sena e já gera a cobrança PIX em uma única chamada.
 * Reaproveita o DTO de venda Sena, omitindo os dados do cliente (resolvidos
 * pelo JWT obtido em POST /whatsapp/auth) e os campos de origem/pagamento
 * (o canal WhatsApp não tem vendedor/distribuidor vinculado e aceita apenas PIX).
 */
export class CriarPedidoSenaWhatsappDto extends OmitType(CreateVendaSenaDto, [
  'cpf',
  'nome',
  'telefone',
  'email',
  'dataNascimento',
  'vendedorId',
  'distribuidorId',
  'seller_id',
  'tipoPagamento',
] as const) {}
