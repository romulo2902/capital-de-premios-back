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

  // ── Campos mantidos por compatibilidade (não utilizados neste endpoint) ──
  @ApiPropertyOptional({
    example: 'vendedor@email.com',
    description: '[DEPRECIADO] E-mail — distribuidores/vendedores devem usar POST /auth/login.',
    deprecated: true,
  })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'Senha@123',
    description: '[DEPRECIADO] Senha — distribuidores/vendedores devem usar POST /auth/login.',
    deprecated: true,
  })
  @ValidateIf((o: LoginLojaDto) => !!o.email)
  @IsString()
  senha?: string;
}
