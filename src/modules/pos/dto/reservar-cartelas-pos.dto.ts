import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReservarCartelasPosDto {
  @ApiProperty({
    type: [String],
    example: ['0276145', '0376145', '0476145'],
    description:
      'Números das cartelas/bilhetes selecionados no POS. Para combo, envie todos os bilhetes retornados em comboAtual.bilhetes.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  cartelas: string[];
}
