import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * Saldo com que todo aparelho novo entra em operação.
 *
 * Menor que o teto de propósito: o aparelho já sai vendendo e ainda sobra
 * espaço de recarga. Nascer com saldo igual ao teto travaria qualquer recarga
 * até o vendedor gastar.
 */
export const CREDITO_INICIAL_MAQUININHA = 2000;

/**
 * Teto máximo que o ADMIN pode conceder a um aparelho.
 *
 * Existe para que um erro de digitação — um zero a mais — não coloque milhares
 * a mais na mão de um vendedor. Aumentar acima disso é decisão de produto, não
 * de operação, e passa por mudar esta constante.
 */
export const LIMITE_CREDITO_MAXIMO = 5000;

export class AtualizarLimiteCreditoDto {
  @ApiProperty({
    example: 2000.0,
    description:
      'Teto de crédito do aparelho em reais, no máximo R$ 5.000,00. Aparelho novo já nasce com o teto em R$ 5.000,00 e R$ 2.000,00 de saldo, então esta rota serve para reduzir o teto de um aparelho específico. Zero significa NÃO CONFIGURADO e bloqueia a venda MANUAL; para travar um aparelho que já opera use `status: INATIVA`.',
    minimum: 0,
    maximum: LIMITE_CREDITO_MAXIMO,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'limiteCredito deve ser um número com no máximo 2 casas decimais',
    },
  )
  @Min(0, { message: 'limiteCredito não pode ser negativo' })
  @Max(LIMITE_CREDITO_MAXIMO, {
    message: `limiteCredito não pode passar de R$ ${LIMITE_CREDITO_MAXIMO.toFixed(2)}`,
  })
  limiteCredito: number;
}
