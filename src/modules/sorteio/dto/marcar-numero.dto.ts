import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class MarcarNumeroDto {
  @ApiProperty({
    example: 7,
    description: 'Número sorteado (1 a 50)',
    minimum: 1,
    maximum: 50,
  })
  @IsInt()
  @Min(1)
  @Max(50)
  numero: number;
}
