import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { TipoPagamento } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
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
    enum: [TipoPagamento.PIX, TipoPagamento.MANUAL],
    example: TipoPagamento.PIX,
    description:
      'Método de pagamento do POS Sena. Aceita PIX para cobrança via gateway ou MANUAL para venda já paga no balcão.',
  })
  @IsOptional()
  @IsEnum(TipoPagamento)
  @IsIn([TipoPagamento.PIX, TipoPagamento.MANUAL], {
    message: 'O POS aceita apenas tipoPagamento PIX ou MANUAL',
  })
  tipoPagamento?: TipoPagamento;
}
