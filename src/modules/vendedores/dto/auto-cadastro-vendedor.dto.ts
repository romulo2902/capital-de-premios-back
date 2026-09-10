import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { TipoChavePix } from '@prisma/client';

/**
 * Formulário público de auto-cadastro de vendedor.
 *
 * Deliberadamente **não** aceita `distribuidorId`, `codigo`, `comissaoPercent`
 * nem `status`: a rede vem do token da URL e o resto é decisão do
 * distribuidor. Com o `forbidNonWhitelisted` global, mandar qualquer um deles
 * devolve 400 em vez de ser silenciosamente ignorado.
 */
export class AutoCadastroVendedorDto {
  @ApiProperty({
    example: 'Maria da Silva',
    description: 'Nome completo do vendedor.',
  })
  @IsString()
  @MinLength(2)
  nome: string;

  @ApiProperty({
    example: '008.016.371-80',
    description:
      'CPF do vendedor (somente números ou formatado). É o login dele na loja.',
  })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({
    example: '(61) 99233-9525',
    description: 'Telefone ou celular com DDD.',
  })
  @IsString()
  @MinLength(8)
  telefone: string;

  @ApiProperty({
    example: 'maria@exemplo.com',
    description: 'E-mail do vendedor. É o login dele no painel.',
  })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiPropertyOptional({
    example: 'SenhaForte123',
    description:
      'Senha de acesso ao painel. Omitida, o vendedor entra com os 6 primeiros dígitos do CPF.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  senha?: string;

  @ApiPropertyOptional({
    example: '1990-04-15',
    description: 'Data de nascimento (ISO 8601).',
  })
  @IsOptional()
  @IsISO8601()
  dataNascimento?: string;

  @ApiPropertyOptional({
    example: '70000-000',
    description: 'CEP.',
  })
  @IsOptional()
  @IsString()
  cep?: string;

  @ApiPropertyOptional({
    example: 'Quadra 3 Conjunto B',
    description: 'Logradouro.',
  })
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiPropertyOptional({ example: '12', description: 'Número do endereço.' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ example: 'Centro', description: 'Bairro.' })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiPropertyOptional({ example: 'Brasília', description: 'Cidade.' })
  @IsOptional()
  @IsString()
  cidade?: string;

  @ApiPropertyOptional({ example: 'DF', description: 'UF com duas letras.' })
  @IsOptional()
  @IsString()
  estado?: string;

  @ApiPropertyOptional({
    enum: TipoChavePix,
    example: TipoChavePix.CPF,
    description: 'Tipo da chave PIX usada para receber comissão.',
  })
  @IsOptional()
  @IsEnum(TipoChavePix)
  tipoChavePix?: TipoChavePix;

  @ApiPropertyOptional({
    example: '00801637180',
    description: 'Chave PIX para receber comissão.',
  })
  @IsOptional()
  @IsString()
  chavePix?: string;
}
