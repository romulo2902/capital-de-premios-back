import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { TipoPagamento } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
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
  'tipoPagamento',
] as const) {
  @ApiPropertyOptional({
    enum: [TipoPagamento.PIX],
    example: TipoPagamento.PIX,
    description:
      'Método de pagamento do POS Sena. Por enquanto, o POS aceita apenas PIX.',
  })
  @IsOptional()
  @IsEnum(TipoPagamento)
  @IsIn([TipoPagamento.PIX], {
    message: 'O POS aceita apenas tipoPagamento PIX por enquanto',
  })
  tipoPagamento?: TipoPagamento;

  @ApiPropertyOptional({
    example: 'c3d4e5f6-a7b8-9012-cdef-345678901234',
    description:
      'Maquininha em que a venda foi passada. Precisa estar ATIVA e vinculada ao operador (do distribuidor logado, ou atribuída ao vendedor logado). Exclusivo do POS — nos demais canais a venda fica sem maquininha.',
  })
  @IsOptional()
  @IsUUID('4')
  maquininhaId?: string;
}
