import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { TipoPagamento } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
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
  'tipoPagamento',
] as const) {
  @ApiPropertyOptional({
    enum: [TipoPagamento.PIX],
    example: TipoPagamento.PIX,
    description:
      'Método de pagamento do POS. Por enquanto, o POS aceita apenas PIX.',
  })
  @IsOptional()
  @IsEnum(TipoPagamento)
  @IsIn([TipoPagamento.PIX], {
    message: 'O POS aceita apenas tipoPagamento PIX por enquanto',
  })
  tipoPagamento?: TipoPagamento;
}
