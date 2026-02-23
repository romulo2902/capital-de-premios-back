import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginLojaDto {
  @ApiProperty({ example: '12345678900', description: 'CPF do cliente (somente números ou formatado)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;
}

