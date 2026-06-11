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

export class CreateVendedorDto {
  @ApiPropertyOptional({
    example: 4933,
    description: 'Código sequencial legível. Gerado automaticamente se omitido. Informar apenas na importação de dados.',
  })
  @IsOptional()
  @IsInt()
  codigo?: number;

  @ApiProperty({
    example: 'uuid-do-distribuidor',
    description: 'ID UUID do distribuidor responsável por este vendedor.',
  })
  @IsString()
  distribuidorId: string;

  @ApiProperty({
    example: 'Maria da Silva',
    description: 'Nome completo do vendedor.',
  })
  @IsString()
  @MinLength(2)
  nome: string;

  @ApiProperty({
    example: '008.016.371-80',
    description: 'CPF do vendedor (somente números ou formatado). Identificador único e usado para login na loja.',
  })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiPropertyOptional({
    example: 'Maria da Silva',
    description: 'Nome do favorecido para transferências PIX. Se omitido, usa o campo nome.',
  })
  @IsOptional()
  @IsString()
  nomeRecebedor?: string;

  @ApiProperty({
    example: '(61) 99233-9525',
    description: 'Telefone ou celular com DDD.',
  })
  @IsString()
  telefone: string;

  @ApiProperty({
    example: 'vendedor@email.com',
    description: 'E-mail do vendedor. Usado para login na loja.',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: '1986-01-31',
    description: 'Data de nascimento no formato ISO 8601 (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsISO8601()
  dataNascimento?: string;

  @ApiPropertyOptional({ example: '72425-070', description: 'CEP do endereço.' })
  @IsOptional()
  @IsString()
  cep?: string;

  @ApiPropertyOptional({ example: 'Quadra 7', description: 'Logradouro (rua, quadra, avenida, etc.).' })
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiPropertyOptional({ example: '10', description: 'Número do endereço.' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ example: 'Setor Oeste (Gama)', description: 'Bairro.' })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiPropertyOptional({ example: 'Brasília', description: 'Cidade.' })
  @IsOptional()
  @IsString()
  cidade?: string;

  @ApiPropertyOptional({ example: 'DF', description: 'UF (sigla do estado com 2 letras).' })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional({
    enum: TipoChavePix,
    example: TipoChavePix.EMAIL,
    description: 'Tipo da chave PIX para recebimento de comissões e saques.',
  })
  @IsOptional()
  @IsEnum(TipoChavePix)
  tipoChavePix?: TipoChavePix;

  @ApiPropertyOptional({
    example: 'locutorrenatosantos@gmail.com',
    description: 'Valor da chave PIX (deve corresponder ao tipoChavePix informado).',
  })
  @IsOptional()
  @IsString()
  chavePix?: string;

  @ApiPropertyOptional({
    example: 'https://loja.capitalpremios.com.br/?ref=VEND001',
    description: 'Link personalizado da loja vinculado a este vendedor.',
  })
  @IsOptional()
  @IsString()
  link?: string;

  @ApiPropertyOptional({
    example: 50,
    description: 'Porcentagem repassada a este vendedor (0 a 100), referente à fatia que o Distribuidor logado ganha do Admin.',
  })
  @IsOptional()
  @IsInt()
  comissaoPercent?: number;

  @ApiPropertyOptional({
    example: '045143',
    description:
      'Senha de acesso à loja. Se omitida, usa os 6 primeiros dígitos do CPF normalizado.',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  senha?: string;
}
