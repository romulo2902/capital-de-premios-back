import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginLojaDto } from './dto/login-loja.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RedefinirSenhaPrimeiroAcessoDto } from './dto/redefinir-senha-primeiro-acesso.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login pelo painel admin (ADMIN apenas) — email + senha' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('loja')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login pela loja (DISTRIBUIDOR/VENDEDOR: email+senha | CLIENTE: CPF)' })
  loginLoja(@Body() dto: LoginLojaDto) {
    return this.authService.loginLoja(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token com refresh token (todos os perfis)' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('redefinir-senha-primeiro-acesso')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redefinir senha de primeiro acesso para DISTRIBUIDOR/VENDEDOR migrado' })
  redefinirSenhaPrimeiroAcesso(@Body() dto: RedefinirSenhaPrimeiroAcessoDto) {
    return this.authService.redefinirSenhaPrimeiroAcesso(dto);
  }
}
