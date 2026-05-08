import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GET /whatsapp/pedidos
 *
 * Consulta pedidos do cliente autenticado (identificado pelo JWT).
 * Os filtros opcionais permitem refinar a busca por ID de pedido ou telefone.
 *
 * ⚠️ Segurança: independentemente dos filtros, somente pedidos do cliente
 * do JWT são retornados — não é possível consultar pedidos de outros clientes.
 */
export class ConsultarPedidosWhatsappDto {
  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'Filtrar por ID específico do pedido. Retorna apenas este pedido se pertencer ao cliente autenticado.',
  })
  @IsOptional()
  @IsUUID('4')
  pedidoId?: string;

  @ApiPropertyOptional({
    example: '61999999999',
    description:
      'Filtrar por telefone do cliente (confirmação). Retorna pedidos apenas se o telefone bater com o cadastro do cliente autenticado.',
  })
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Página (default: 1).',
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Itens por página (default: 10, máximo: 50).',
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
