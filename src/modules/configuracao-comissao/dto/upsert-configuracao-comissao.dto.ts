import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max } from 'class-validator';

export class UpsertConfiguracaoComissaoDto {
  @ApiProperty({
    example: 15,
    description:
      'Percentual de comissão do distribuidor aplicado diretamente sobre o total da venda (0–100). Ex: 15 significa 15% do valor total.',
    minimum: 0,
    maximum: 100,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentualDistribuidor: number;

  @ApiProperty({
    example: 5,
    description:
      'Percentual de comissão do vendedor aplicado diretamente sobre o total da venda (0–100). Ex: 5 significa 5% do valor total. Independente do percentual do distribuidor.',
    minimum: 0,
    maximum: 100,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentualVendedor: number;
}
