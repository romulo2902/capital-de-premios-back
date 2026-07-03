import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateVendaDto {
  @ApiPropertyOptional({
    example: 'Romulo Valadares',
    description: 'Nome completo do cliente.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @ApiPropertyOptional({
    example: '(61) 99999-9999',
    description: 'Telefone do cliente com DDD.',
  })
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional({
    example: '11/04/1976',
    description: 'Data de nascimento. Aceita DD/MM/YYYY ou YYYY-MM-DD.',
  })
  @IsOptional()
  @IsString()
  dataNascimento?: string;

  @ApiPropertyOptional({
    example: '71745-004',
    description: 'CEP do cliente.',
  })
  @IsOptional()
  @IsString()
  cep?: string;

  @ApiPropertyOptional({
    example: 'Quadra SPWM',
    description: 'Endereço do cliente.',
  })
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiPropertyOptional({
    example: '000',
    description: 'Número/complemento do endereço.',
  })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({
    example: 'Park Way',
    description: 'Bairro do cliente.',
  })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiPropertyOptional({
    example: 'Brasilia',
    description: 'Cidade do cliente.',
  })
  @IsOptional()
  @IsString()
  cidade?: string;

  @ApiPropertyOptional({
    example: 'DF',
    description: 'UF do cliente (sigla com 2 letras).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, {
    message: 'estado deve conter 2 letras (UF)',
  })
  estado?: string;

  @ApiPropertyOptional({
    example: 'cliente@email.com',
    description: 'Email do cliente.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

