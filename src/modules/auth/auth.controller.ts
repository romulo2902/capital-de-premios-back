import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginLojaDto } from './dto/login-loja.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RedefinirSenhaPrimeiroAcessoDto } from './dto/redefinir-senha-primeiro-acesso.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RedefinirSenhaAdminDto } from './dto/redefinir-senha-admin.dto';

/**
 * Controller de autenticação — Capital de Prêmios
 *
 * Endpoints:
 *  - POST /auth/login      → Painel Admin (ADMIN, DISTRIBUIDOR, VENDEDOR) — email + senha
 *  - POST /auth/loja       → Painel Cliente (CLIENTE) — CPF, sem senha
 *  - POST /auth/refresh    → Renovar access token (todos os perfis)
 *  - POST /auth/redefinir-senha-primeiro-acesso → Redefinir senha migrada (DISTRIBUIDOR, VENDEDOR)
 *  - POST /auth/admin/redefinir-senha → ADMIN redefine senha de vendedor/distribuidor
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
      'cria um registro com nome, telefone e data de nascimento informados no primeiro acesso.',
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

  @Post('admin/redefinir-senha')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'ADMIN redefine senha de vendedor/distribuidor (sem SMTP)',
    description:
      'Atualiza a senha diretamente no banco com hash bcrypt, informando o usuarioId alvo (VENDEDOR ou DISTRIBUIDOR).',
  })
  redefinirSenhaPorAdmin(@Body() dto: RedefinirSenhaAdminDto) {
    return this.authService.redefinirSenhaPorAdmin(dto);
  }
}
