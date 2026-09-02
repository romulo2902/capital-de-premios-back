import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { TipoPagamento } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
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
    enum: [TipoPagamento.PIX, TipoPagamento.MANUAL],
    example: TipoPagamento.PIX,
    description:
      'Método de pagamento do POS. Aceita PIX para cobrança via gateway ou MANUAL para venda já paga na maquininha.',
  })
  @IsOptional()
  @IsEnum(TipoPagamento)
  @IsIn([TipoPagamento.PIX, TipoPagamento.MANUAL], {
    message: 'O POS aceita apenas tipoPagamento PIX ou MANUAL',
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
