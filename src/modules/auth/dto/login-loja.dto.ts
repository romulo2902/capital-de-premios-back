import { IsEmail, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * POST /auth/loja — autenticação unificada para a loja (web)
 *
 * CLIENTE  → envia { cpf }            (sem senha)
 * VENDEDOR → envia { email, senha }   (com credenciais)
 */
export class LoginLojaDto {
  // ── CLIENTE ─────────────────────────────────────────────
  @ApiPropertyOptional({
    example: '123.456.789-00',
    description: 'CPF do cliente (somente números ou formatado). Usar quando for CLIENTE.',
  })
  @IsOptional()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf?: string;

  // ── VENDEDOR ────────────────────────────────────────────
  @ApiPropertyOptional({
    example: 'vendedor@email.com',
    description: 'E-mail do vendedor. Usar quando for VENDEDOR.',
  })
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @ApiPropertyOptional({
    example: 'Senha@123',
    description: 'Senha do vendedor. Obrigatório quando email for informado.',
  })
  @ValidateIf((o: LoginLojaDto) => !!o.email)
  @IsString()
  senha?: string;
}
