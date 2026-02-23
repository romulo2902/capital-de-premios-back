import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginLojaDto } from './dto/login-loja.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login pelo e-mail e senha (painel admin/vendedor)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('loja')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login pelo CPF (loja — cliente final)' })
  loginLoja(@Body() dto: LoginLojaDto) {
    return this.authService.loginLoja(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token com refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }
}
