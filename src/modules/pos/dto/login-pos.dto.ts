import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class LoginPosDto {
  @ApiProperty({
    example: '12345678900',
    description:
      'CPF do operador do POS (VENDEDOR ou DISTRIBUIDOR). Somente números ou formatado.',
  })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;
}
