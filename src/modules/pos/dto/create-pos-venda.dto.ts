import { OmitType } from '@nestjs/swagger';
import { CreateVendaDto } from '../../vendas/dto/create-venda.dto';

/**
 * Venda POS — Capital de Prêmios.
 *
 * Reaproveita o DTO de venda, mas omite os campos de origem: o vínculo do
 * vendedor/distribuidor vem do token do POS e a origem é sempre POS.
 */
export class CreatePosVendaDto extends OmitType(CreateVendaDto, [
  'vendedorId',
  'distribuidorId',
  'origemParticipacao',
] as const) {}
