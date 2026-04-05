import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * POST /auth/loja — autenticação do painel cliente
 *
 * CLIENTE → envia { cpf } (sem senha)
 *
 * Nota: Distribuidores e vendedores agora logam pelo painel admin
 * via `POST /auth/login` (email + senha). Os campos `email` e `senha`
 * permanecem neste DTO por compatibilidade, mas são ignorados — o
 * serviço exige apenas o CPF.
 */
export class LoginLojaDto {
  // ── CLIENTE ─────────────────────────────────────────────
  @ApiPropertyOptional({
    example: '123.456.789-00',
    description: 'CPF do cliente (somente números ou formatado).',
  })
  @IsOptional()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf?: string;

  @ApiPropertyOptional({ example: 'João Silva', description: 'Obrigatório no primeiro acesso se o CPF for novo.' })
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional({ example: '(61) 99999-9999', description: 'Obrigatório no primeiro acesso se o CPF for novo.' })
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional({ example: 'joao@email.com', description: 'E-mail do cliente (opcional)' })
  @IsOptional()
  @IsString()
  email?: string;
}
