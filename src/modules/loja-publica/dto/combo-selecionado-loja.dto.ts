import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const NUMERO_BASE_REGEX = /^\d{7,}$/;

export class ComboSelecionadoLojaDto {
  @ApiProperty({
    example: '0276531',
    description:
      'Número-base do combo escolhido pelo cliente dentro da sequência determinística da cartela.',
  })
  @IsString()
  @Matches(NUMERO_BASE_REGEX, {
    message: 'numeroBase deve possuir ao menos 7 dígitos numéricos',
  })
  numeroBase: string;
}
