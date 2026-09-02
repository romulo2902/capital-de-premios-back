import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoMovimentoCredito } from '@prisma/client';
import {
  IsIn,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Tipos que o ADMIN pode lançar à mão.
 *
 * `CONSUMO` e `ESTORNO` ficam de fora de propósito: nascem da venda e do
 * cancelamento, dentro da transação deles. Aceitá-los aqui permitiria
 * descolar o razão das vendas que ele deveria espelhar.
 */
export const TIPOS_MOVIMENTO_MANUAL = [
  TipoMovimentoCredito.RECARGA,
  TipoMovimentoCredito.AJUSTE_CREDITO,
  TipoMovimentoCredito.AJUSTE_DEBITO,
] as const;

export class LancarCreditoMaquininhaDto {
  @ApiProperty({
    enum: TIPOS_MOVIMENTO_MANUAL,
    example: TipoMovimentoCredito.RECARGA,
    description:
      'Tipo do lançamento. RECARGA concede crédito; AJUSTE_CREDITO e AJUSTE_DEBITO corrigem o saldo. CONSUMO e ESTORNO não são aceitos aqui — vêm da venda e do cancelamento.',
  })
  @IsIn(TIPOS_MOVIMENTO_MANUAL, {
    message:
      'tipo deve ser RECARGA, AJUSTE_CREDITO ou AJUSTE_DEBITO. CONSUMO e ESTORNO são gerados pela venda',
  })
  tipo: (typeof TIPOS_MOVIMENTO_MANUAL)[number];

  @ApiProperty({
    example: 500.0,
    description:
      'Valor do lançamento em reais. Sempre positivo — o sinal vem do `tipo`.',
    minimum: 0.01,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'valor deve ser um número com no máximo 2 casas decimais' },
  )
  @IsPositive({ message: 'valor deve ser positivo — o sinal vem do tipo' })
  valor: number;

  @ApiPropertyOptional({
    example: 'Recarga semanal da rede Centro',
    description:
      'Justificativa do lançamento. Obrigatório nos ajustes, para que a correção não fique sem explicação no extrato.',
    maxLength: 200,
  })
  // Sem `@IsOptional()` de propósito: ele pula a validação quando o campo vem
  // vazio, que é justamente o caso que o ajuste precisa recusar. O
  // `@ValidateIf` faz os dois papéis — nos ajustes valida sempre (então
  // ausente derruba no `@IsString`), nos demais só quando o campo veio.
  @ValidateIf(
    (dto: LancarCreditoMaquininhaDto) =>
      dto.tipo === TipoMovimentoCredito.AJUSTE_CREDITO ||
      dto.tipo === TipoMovimentoCredito.AJUSTE_DEBITO ||
      dto.motivo !== undefined,
  )
  @IsString({ message: 'motivo é obrigatório em lançamentos de ajuste' })
  @MaxLength(200)
  motivo?: string;
}
