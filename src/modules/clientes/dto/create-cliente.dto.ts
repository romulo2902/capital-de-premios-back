import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateClienteDto {
  @ApiPropertyOptional({
    example: 129969,
    description: 'Código sequencial legível. Gerado automaticamente se omitido. Informar apenas na importação de dados.',
  })
  @IsOptional()
  @IsInt()
  codigo?: number;

  @ApiProperty({
    example: '200.074.694-20',
    description: 'CPF do cliente (somente números ou formatado). Identificador único — se já existir, retorna o cadastro existente.',
  })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({
    example: 'Arcelino Douglas de Azevedo Leitão',
    description: 'Nome completo do cliente.',
  })
  @IsString()
  @MinLength(2)
  nome: string;

  @ApiProperty({
    example: '(84) 99453-7929',
    description: 'Celular ou telefone com DDD.',
  })
  @IsString()
  telefone: string;

  @ApiPropertyOptional({
    example: '1960-02-01',
    description: 'Data de nascimento no formato ISO 8601 (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsISO8601()
  dataNascimento?: string;

  @ApiPropertyOptional({ example: '70673-306', description: 'CEP do endereço.' })
  @IsOptional()
  @IsString()
  cep?: string;

  @ApiPropertyOptional({ example: 'Quadra SQSW 303 Bloco F', description: 'Logradouro (rua, quadra, avenida, etc.).' })
  @IsOptional()
  @IsString()
  endereco?: string;

  @ApiPropertyOptional({ example: 'Casa 2', description: 'Número ou complemento do endereço.' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ example: 'Setor Sudoeste', description: 'Bairro.' })
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
    example: 'cliente@email.com',
    description: 'E-mail do cliente (opcional).',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-vendedor',
    description: 'ID UUID do vendedor ao qual este cliente está vinculado. Nulo se o cliente comprou de forma autônoma.',
  })
  @IsOptional()
  @IsString()
  vendedorId?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-distribuidor',
    description: 'ID UUID do distribuidor/revendedor ao qual este cliente está vinculado.',
  })
  @IsOptional()
  @IsString()
  distribuidorId?: string;
}
