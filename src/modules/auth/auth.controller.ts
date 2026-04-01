import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginLojaDto } from './dto/login-loja.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RedefinirSenhaPrimeiroAcessoDto } from './dto/redefinir-senha-primeiro-acesso.dto';

/**
 * Controller de autenticação — Capital de Prêmios
 *
 * Endpoints:
 *  - POST /auth/login      → Painel Admin (ADMIN, DISTRIBUIDOR, VENDEDOR) — email + senha
 *  - POST /auth/loja       → Painel Cliente (CLIENTE) — CPF, sem senha
 *  - POST /auth/refresh    → Renovar access token (todos os perfis)
 *  - POST /auth/redefinir-senha-primeiro-acesso → Redefinir senha migrada (DISTRIBUIDOR, VENDEDOR)
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login do painel admin (ADMIN, DISTRIBUIDOR, VENDEDOR) — email + senha',
    description:
      'Autentica usuários do painel administrativo. ' +
      'Aceita ADMIN, DISTRIBUIDOR e VENDEDOR. ' +
      'O frontend controla as permissões de cada perfil.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('loja')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login do painel cliente (CLIENTE) — CPF, sem senha',
    description:
      'Autentica clientes pelo CPF. Se o cliente não existir, ' +
      'cria um registro temporário que será completado na primeira compra.',
  })
  loginLoja(@Body() dto: LoginLojaDto) {
    return this.authService.loginLoja(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar access token com refresh token (todos os perfis)',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('redefinir-senha-primeiro-acesso')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redefinir senha de primeiro acesso (DISTRIBUIDOR, VENDEDOR)',
    description:
      'Para usuários migrados que precisam redefinir a senha temporária ' +
      'antes de acessar o painel admin.',
  })
  redefinirSenhaPrimeiroAcesso(@Body() dto: RedefinirSenhaPrimeiroAcessoDto) {
    return this.authService.redefinirSenhaPrimeiroAcesso(dto);
  }
}
