import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginLojaDto } from './dto/login-loja.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

type UsuarioRow = {
  id: string;
  email: string | null;
  cpf: string | null;
  senhaHash: string | null;
  perfil: string;
  status: string;
};

export interface JwtPayload {
  sub: string;
  perfil: string;
  email?: string;
  cpf?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<{ message: string; data: unknown }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!usuario || !usuario.senhaHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const senhaValida = await bcrypt.compare(dto.senha, usuario.senhaHash);
    if (!senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (usuario.status === 'INATIVO') {
      throw new UnauthorizedException('Usuário inativo');
    }

    const tokens = this.gerarTokens(usuario as unknown as UsuarioRow);
    this.logger.log(`Login realizado: ${usuario.email} [${usuario.perfil}]`);

    return {
      message: 'Login realizado com sucesso',
      data: { ...tokens, usuario: { id: usuario.id, email: usuario.email, perfil: usuario.perfil } },
    };
  }

  async loginLoja(dto: LoginLojaDto): Promise<{ message: string; data: unknown }> {
    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    let cliente = await this.prisma.cliente.findUnique({ where: { cpf: cpfLimpo } });

    if (!cliente) {
      cliente = await this.prisma.cliente.create({
        data: { cpf: cpfLimpo, nome: '', telefone: '' },
      });
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { cpf: cpfLimpo } });

    let accessToken: string;
    if (usuario) {
      accessToken = this.gerarAccessToken(usuario as unknown as UsuarioRow);
    } else {
      const payload: JwtPayload = { sub: cliente.id, perfil: 'CLIENTE', cpf: cpfLimpo };
      // Cast to any to bypass strict expiresIn type (string is valid runtime value)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      accessToken = this.jwtService.sign(payload as any, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m') as any,
      });
    }

    this.logger.log(`Login loja CPF: ${cpfLimpo}`);
    return { message: 'Login realizado com sucesso', data: { accessToken, cliente } };
  }

  async refresh(dto: RefreshTokenDto): Promise<{ message: string; data: unknown }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });

      const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
      if (!usuario || usuario.status === 'INATIVO') {
        throw new UnauthorizedException('Token inválido');
      }

      const accessToken = this.gerarAccessToken(usuario as unknown as UsuarioRow);
      return { message: 'Token renovado', data: { accessToken } };
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
  }

  private gerarTokens(usuario: UsuarioRow): AuthTokens {
    return {
      accessToken: this.gerarAccessToken(usuario),
      refreshToken: this.gerarRefreshToken(usuario),
    };
  }

  private gerarAccessToken(usuario: UsuarioRow): string {
    const payload: JwtPayload = { sub: usuario.id, perfil: usuario.perfil, email: usuario.email ?? undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.jwtService.sign(payload as any, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m') as any,
    });
  }

  private gerarRefreshToken(usuario: UsuarioRow): string {
    const payload: JwtPayload = { sub: usuario.id, perfil: usuario.perfil };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.jwtService.sign(payload as any, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES', '7d') as any,
    });
  }
}
