import { ForbiddenException, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginLojaDto } from './dto/login-loja.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RedefinirSenhaPrimeiroAcessoDto } from './dto/redefinir-senha-primeiro-acesso.dto';

type UsuarioRow = {
  id: string;
  email: string | null;
  cpf: string | null;
  senhaHash: string | null;
  perfil: string;
  deveRedefinirSenha: boolean;
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

    if (usuario.deveRedefinirSenha) {
      throw new ForbiddenException('Usuário deve redefinir a senha antes de acessar');
    }

    // Apenas ADMIN pode acessar o painel admin
    if (usuario.perfil !== 'ADMIN') {
      throw new UnauthorizedException('Acesso restrito ao painel administrativo (ADMIN)');
    }

    const tokens = this.gerarTokens(usuario as unknown as UsuarioRow);
    this.logger.log(`Login admin: ${usuario.email} [${usuario.perfil}]`);

    return {
      message: 'Login realizado com sucesso',
      data: { ...tokens, perfil: usuario.perfil, usuario: { id: usuario.id, email: usuario.email, perfil: usuario.perfil } },
    };
  }

  async loginLoja(dto: LoginLojaDto): Promise<{ message: string; data: unknown }> {
    // ── DISTRIBUIDOR ou VENDEDOR: email + senha ───────────────────
    if (dto.email && dto.senha) {
      const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });

      if (!usuario || !usuario.senhaHash) {
        throw new UnauthorizedException('Credenciais inválidas');
      }
      if (usuario.status === 'INATIVO') {
        throw new UnauthorizedException('Usuário inativo');
      }
      if (usuario.perfil !== 'VENDEDOR' && usuario.perfil !== 'DISTRIBUIDOR') {
        throw new UnauthorizedException('Credenciais inválidas');
      }

      const senhaValida = await bcrypt.compare(dto.senha, usuario.senhaHash);
      if (!senhaValida) throw new UnauthorizedException('Credenciais inválidas');

      if (usuario.deveRedefinirSenha) {
        throw new ForbiddenException('Usuário deve redefinir a senha antes de acessar');
      }

      const tokens = this.gerarTokens(usuario as unknown as UsuarioRow);

      if (usuario.perfil === 'DISTRIBUIDOR') {
        const distribuidor = await this.prisma.distribuidor.findFirst({ where: { usuarioId: usuario.id } });
        this.logger.log(`Login loja DISTRIBUIDOR: ${usuario.email}`);
        return {
          message: 'Login realizado com sucesso',
          data: { ...tokens, perfil: 'DISTRIBUIDOR', distribuidor },
        };
      }

      // VENDEDOR
      const vendedor = await this.prisma.vendedor.findFirst({ where: { usuarioId: usuario.id } });
      this.logger.log(`Login loja VENDEDOR: ${usuario.email}`);
      return {
        message: 'Login realizado com sucesso',
        data: { ...tokens, perfil: 'VENDEDOR', vendedor },
      };
    }

    // ── CLIENTE: CPF apenas (sem senha) ──────────────────────────
    if (!dto.cpf) {
      throw new UnauthorizedException('Informe CPF (cliente) ou email+senha (vendedor/distribuidor)');
    }

    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    let cliente = await this.prisma.cliente.findUnique({ where: { cpf: cpfLimpo } });
    if (!cliente) {
      // Auto-cria um registro temporário; dados completos são preenchidos na compra
      cliente = await this.prisma.cliente.create({
        data: { cpf: cpfLimpo, nome: '', telefone: '' },
      });
    }

    const payload: JwtPayload = { sub: cliente.id, perfil: 'CLIENTE', cpf: cpfLimpo };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessToken = this.jwtService.sign(payload as any, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m') as any,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refreshToken = this.jwtService.sign(payload as any, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES', '7d') as any,
    });

    this.logger.log(`Login loja CLIENTE: CPF ${cpfLimpo}`);
    return {
      message: 'Login realizado com sucesso',
      data: { accessToken, refreshToken, perfil: 'CLIENTE', cliente },
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<{ message: string; data: unknown }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });

      // CLIENTE não tem Usuario — busca direto na tabela Cliente
      if (payload.perfil === 'CLIENTE') {
        const cliente = await this.prisma.cliente.findUnique({ where: { id: payload.sub } });
        if (!cliente || cliente.status === 'INATIVO') {
          throw new UnauthorizedException('Token inválido');
        }
        const clientePayload: JwtPayload = { sub: cliente.id, perfil: 'CLIENTE', cpf: cliente.cpf };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accessToken = this.jwtService.sign(clientePayload as any, {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES', '15m') as any,
        });
        return { message: 'Token renovado', data: { accessToken } };
      }

      // ADMIN, DISTRIBUIDOR, VENDEDOR — busca pelo Usuario
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

  async redefinirSenhaPrimeiroAcesso(
    dto: RedefinirSenhaPrimeiroAcessoDto,
  ): Promise<{ message: string }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!usuario || !usuario.senhaHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (usuario.perfil !== 'VENDEDOR' && usuario.perfil !== 'DISTRIBUIDOR') {
      throw new ForbiddenException('Operação permitida apenas para vendedor ou distribuidor');
    }

    const senhaValida = await bcrypt.compare(dto.senhaAtual, usuario.senhaHash);
    if (!senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash: await bcrypt.hash(dto.novaSenha, 10),
        deveRedefinirSenha: false,
      },
    });

    this.logger.log(`Senha redefinida no primeiro acesso: ${usuario.email} [${usuario.perfil}]`);
    return { message: 'Senha redefinida com sucesso' };
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
