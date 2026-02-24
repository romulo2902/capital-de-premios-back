import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { TipoChavePix } from '@prisma/client';

export class CreateDistribuidorDto {
  @ApiPropertyOptional({
    example: 255,
    description: 'Código sequencial legível. Gerado automaticamente se omitido. Informar apenas na importação de dados.',
  })
  @IsOptional()
  @IsInt()
  codigo?: number;

  @ApiProperty({
    example: 'João da Silva',
    description: 'Nome completo do distribuidor.',
  })
  @IsString()
  @MinLength(2)
  nome: string;

  @ApiProperty({
    example: '05542.384-10',
    description: 'CPF do distribuidor (somente números ou formatado). Identificador único único.',
  })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({
    example: '(61) 99952-3826',
    description: 'Telefone ou celular com DDD.',
  })
  @IsString()
  telefone: string;

  @ApiProperty({
    example: 'distribuidor@email.com',
    description: 'E-mail principal. Usado para login no painel admin.',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: '1990-05-20',
    description: 'Data de nascimento no formato ISO 8601 (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsISO8601()
  dataNascimento?: string;

  @ApiPropertyOptional({ example: '73700-000', description: 'CEP do endereço.' })
  @IsOptional()
  @IsString()
  cep?: string;

  @ApiPropertyOptional({ example: 'Rua das Flores', description: 'Logradouro (rua, avenida, quadra, etc.).' })
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiPropertyOptional({ example: '100', description: 'Número do endereço.' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ example: 'Centro', description: 'Bairro.' })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiPropertyOptional({ example: 'Padre Bernardo', description: 'Cidade.' })
  @IsOptional()
  @IsString()
  cidade?: string;

  @ApiPropertyOptional({ example: 'GO', description: 'UF (sigla do estado com 2 letras).' })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional({
    enum: TipoChavePix,
    example: TipoChavePix.EMAIL,
    description: 'Tipo da chave PIX para recebimento de saques.',
  })
  @IsOptional()
  @IsEnum(TipoChavePix)
  tipoChavePix?: TipoChavePix;

  @ApiPropertyOptional({
    example: 'distribuidor@email.com',
    description: 'Valor da chave PIX (deve corresponder ao tipoChavePix informado).',
  })
  @IsOptional()
  @IsString()
  chavePix?: string;

  @ApiPropertyOptional({
    example: 'https://loja.capitalpremios.com.br/?ref=DIST001',
    description: 'Link personalizado da loja vinculado a este distribuidor.',
  })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({
    example: 'Senha@123',
    description: 'Senha de acesso ao painel admin. Se omitida, usa "Dist@123" como padrão.',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  senha?: string;
}
