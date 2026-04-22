import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFaleConoscoDto {
  @ApiProperty({
    example: 'João da Silva',
    description: 'Nome completo da pessoa que está entrando em contato.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome: string;

  @ApiProperty({
    example: '12345678900',
    description: 'CPF com ou sem máscara.',
  })
  @IsString()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({
    example: 'joao@email.com',
    description: 'E-mail para retorno.',
  })
  @IsEmail()
  @MaxLength(120)
  email: string;

  @ApiProperty({
    example: '(61) 99999-9999',
    description: 'Telefone de contato.',
  })
  @IsString()
  @Matches(/^\+?[\d\s().-]{10,20}$/, { message: 'Telefone inválido' })
  telefone: string;

  @ApiProperty({
    example:
      'Olá, preciso de ajuda para localizar meus números após uma compra.',
    description: 'Mensagem enviada no formulário.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  mensagem: string;

  @ApiPropertyOptional({
    example: '',
    description:
      'Honeypot anti-bot. Deve permanecer vazio e oculto no frontend.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}
