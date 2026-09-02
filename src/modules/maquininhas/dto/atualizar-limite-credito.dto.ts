import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class AtualizarLimiteCreditoDto {
  @ApiProperty({
    example: 5000.0,
    description:
      'Teto de crédito do aparelho em reais. Zero desliga o controle: a maquininha volta a vender sem consumir crédito. Para travar o aparelho de vez use `status: INATIVA`.',
    minimum: 0,
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'limiteCredito deve ser um número com no máximo 2 casas decimais',
    },
  )
  @Min(0, { message: 'limiteCredito não pode ser negativo' })
  limiteCredito: number;
}
