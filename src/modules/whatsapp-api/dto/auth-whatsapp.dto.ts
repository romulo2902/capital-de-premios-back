import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

/**
 * POST /whatsapp/auth
 *
 * Registra ou autentica um cliente via CPF.
 *
 * **Comportamento:**
 * - Se o CPF já estiver cadastrado → autentica e retorna o JWT.
 * - Se o CPF for novo → cria o cliente e retorna o JWT.
 *
 * **Campos obrigatórios no primeiro acesso (CPF novo):**
 * `nome` e `telefone` são sempre obrigatórios nesta rota para garantir
 * que o bot sempre registre um cliente completo.
 */
export class AuthWhatsappDto {
  @ApiProperty({
    example: '123.456.789-00',
    description:
      'CPF do cliente (formatado ou somente números). ' +
      'Usado como identificador único do cliente na plataforma.',
  })
  @IsString()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, {
    message: 'CPF inválido. Informe 11 dígitos ou no formato 000.000.000-00',
  })
  cpf: string;

  @ApiProperty({
    example: 'João da Silva',
    description:
      'Nome completo do cliente. Obrigatório para registro e atualização de cadastro.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres' })
  nome: string;

  @ApiProperty({
    example: '61999999999',
    description:
      'Telefone com DDD (somente números ou formatado). Obrigatório — ' +
      'usado para identificar o cliente no WhatsApp e para consulta de pedidos.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  @Matches(/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, {
    message: 'Telefone inválido. Ex: 61999999999 ou (61) 99999-9999',
  })
  telefone: string;

  @ApiPropertyOptional({
    example: 'joao@email.com',
    description: 'E-mail do cliente (opcional).',
  })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @ApiPropertyOptional({
    example: '1990-01-15',
    description: 'Data de nascimento no formato YYYY-MM-DD (opcional).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Data de nascimento deve estar no formato YYYY-MM-DD',
  })
  dataNascimento?: string;
}
