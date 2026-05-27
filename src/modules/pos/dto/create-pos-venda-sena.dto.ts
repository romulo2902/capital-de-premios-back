import { OmitType } from '@nestjs/swagger';
import { CreateVendaSenaDto } from '../../capital-sena/vendas-sena/dto/create-venda-sena.dto';

/**
 * Venda POS — Capital Sena.
 *
 * Reaproveita o DTO de venda Sena, omitindo os campos de origem: o vínculo do
 * vendedor/distribuidor vem do token do POS e a origem é sempre POS.
 */
export class CreatePosVendaSenaDto extends OmitType(CreateVendaSenaDto, [
  'vendedorId',
  'distribuidorId',
  'seller_id',
  'origemParticipacao',
] as const) {}
