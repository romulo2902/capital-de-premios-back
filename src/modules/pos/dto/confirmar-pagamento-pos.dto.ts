import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Dados de pagamento devolvidos pela maquininha do POS (resposta PagBank) para
 * validação e confirmação da venda do nosso lado.
 */
export class ConfirmarPagamentoPosDto {
  @ApiProperty({
    example: 'CHAR_1A2B3C4D-5E6F-7890-ABCD-EF1234567890',
    description:
      'Identificador da transação/cobrança retornado pela maquininha (charge/order id PagBank).',
  })
  @IsString()
  @MinLength(1)
  transacaoId: string;

  @ApiProperty({
    example: 'PAID',
    description:
      'Status do pagamento reportado pela maquininha (ex.: PAID, APPROVED).',
  })
  @IsString()
  @MinLength(1)
  status: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Resposta bruta do PagBank recebida da maquininha, persistida para auditoria.',
  })
  @IsOptional()
  @IsObject()
  pagamento?: Record<string, unknown>;
}
