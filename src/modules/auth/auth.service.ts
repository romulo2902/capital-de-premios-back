import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginLojaDto } from './dto/login-loja.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RedefinirSenhaPrimeiroAcessoDto } from './dto/redefinir-senha-primeiro-acesso.dto';
import { RedefinirSenhaAdminDto } from './dto/redefinir-senha-admin.dto';

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

/**
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ REGRAS DE AUTENTICAÇÃO — Capital de Prêmios                    │
 * ├──────────────────────────────────────────────────────────────────┤
 * │                                                                │
 * │  POST /auth/login   →  Painel Admin (email + senha)            │
 * │                        Perfis: ADMIN, DISTRIBUIDOR, VENDEDOR   │
 * │                        O frontend controla permissões via      │
 * │                        campo `perfil` retornado no token.      │
 * │                                                                │
 * │  POST /auth/loja    →  Painel Cliente (CPF, sem senha)         │
 * │                        Perfil: CLIENTE                         │
 * │                        Auto-cria cliente se não existir.       │
 * │                                                                │
 * │  POST /auth/refresh →  Renovação de token (todos os perfis)   │
 * │                                                                │
 * │  POST /auth/redefinir-senha-primeiro-acesso                    │
 * │                     →  Redefinir senha migrada                 │
 * │                        Perfis: DISTRIBUIDOR, VENDEDOR          │
 * │                                                                │
 * └──────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Perfis que podem acessar o painel administrativo */
  private static readonly PERFIS_ADMIN: ReadonlySet<string> = new Set([
    'ADMIN',
    'DISTRIBUIDOR',
    'VENDEDOR',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Login do painel administrativo — `POST /auth/login`
   *
   * Aceita ADMIN, DISTRIBUIDOR e VENDEDOR (email + senha).
   * O frontend diferencia as permissões pelo campo `perfil` presente
   * no JWT e no corpo da resposta.
   *
   * Retorna dados do perfil específico (distribuidor/vendedor) quando
   * aplicável, para que o frontend tenha o contexto necessário (ex.: nome,
   * saldo, distribuidorId, vendedorId).
   */
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
      throw new ForbiddenException(
        'Usuário deve redefinir a senha antes de acessar',
      );
    }

    // Apenas perfis do painel admin podem logar aqui (ADMIN, DISTRIBUIDOR, VENDEDOR)
    if (!AuthService.PERFIS_ADMIN.has(usuario.perfil)) {
      throw new UnauthorizedException(
        'Acesso restrito ao painel administrativo',
      );
    }

    const tokens = this.gerarTokens(usuario as unknown as UsuarioRow);

    // Monta dados adicionais do perfil para o frontend
    const perfilData = await this.buscarDadosPerfil(usuario.id, usuario.perfil);

    this.logger.log(`Login painel: ${usuario.email} [${usuario.perfil}]`);

    return {
      message: 'Login realizado com sucesso',
      data: {
        ...tokens,
        perfil: usuario.perfil,
        usuario: {
          id: usuario.id,
          email: usuario.email,
          perfil: usuario.perfil,
        },
        ...perfilData,
      },
    };
  }

  /**
   * Login do painel cliente — `POST /auth/loja`
   *
   * Exclusivo para CLIENTE (CPF, sem senha).
   * Se o cliente não existir, cria um registro temporário que será
   * completado na primeira compra.
   */
  async loginLoja(
    dto: LoginLojaDto,
  ): Promise<{ message: string; data: unknown }> {
    if (!dto.cpf) {
      throw new UnauthorizedException('Informe o CPF para acessar');
    }

    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    let cliente = await this.prisma.cliente.findUnique({
      where: { cpf: cpfLimpo },
    });
    if (!cliente) {
      if (!dto.nome || !dto.telefone) {
        throw new UnauthorizedException(
          'CPF não cadastrado. Por favor, forneça nome e telefone para realizar o primeiro acesso.',
        );
      }

      cliente = await this.prisma.cliente.create({
        data: {
          cpf: cpfLimpo,
          nome: dto.nome,
          telefone: dto.telefone,
          email: dto.email || null,
        },
      });
    }

    const payload: JwtPayload = {
      sub: cliente.id,
      perfil: 'CLIENTE',
      cpf: cpfLimpo,
    };
    const accessToken = this.jwtService.sign(
      payload,
      this.getAccessTokenOptions(),
    );
    const refreshToken = this.jwtService.sign(
      payload,
      this.getRefreshTokenOptions(),
    );

    this.logger.log(`Login cliente: CPF ${cpfLimpo}`);
    return {
      message: 'Login realizado com sucesso',
      data: { accessToken, refreshToken, perfil: 'CLIENTE', cliente },
    };
  }

  async refresh(
    dto: RefreshTokenDto,
  ): Promise<{ message: string; data: unknown }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });

      // CLIENTE não tem Usuario — busca direto na tabela Cliente
      if (payload.perfil === 'CLIENTE') {
        const cliente = await this.prisma.cliente.findUnique({
          where: { id: payload.sub },
        });
        if (!cliente || cliente.status === 'INATIVO') {
          throw new UnauthorizedException('Token inválido');
        }
        const clientePayload: JwtPayload = {
          sub: cliente.id,
          perfil: 'CLIENTE',
          cpf: cliente.cpf,
        };
        const accessToken = this.jwtService.sign(
          clientePayload,
          this.getAccessTokenOptions(),
        );
        return { message: 'Token renovado', data: { accessToken } };
      }

      // ADMIN, DISTRIBUIDOR, VENDEDOR — busca pelo Usuario
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: payload.sub },
      });
      if (!usuario || usuario.status === 'INATIVO') {
        throw new UnauthorizedException('Token inválido');
      }

      const accessToken = this.gerarAccessToken(
        usuario as unknown as UsuarioRow,
      );
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
      throw new ForbiddenException(
        'Operação permitida apenas para vendedor ou distribuidor',
      );
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

    this.logger.log(
      `Senha redefinida no primeiro acesso: ${usuario.email} [${usuario.perfil}]`,
    );
    return { message: 'Senha redefinida com sucesso' };
  }

  async redefinirSenhaPorAdmin(
    dto: RedefinirSenhaAdminDto,
  ): Promise<{ message: string }> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: dto.usuarioId },
    });

    if (!usuario) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (usuario.perfil !== 'VENDEDOR' && usuario.perfil !== 'DISTRIBUIDOR') {
      throw new ForbiddenException(
        'Operação permitida apenas para vendedor ou distribuidor',
      );
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        senhaHash: await bcrypt.hash(dto.novaSenha, 10),
        deveRedefinirSenha: false,
      },
    });

    this.logger.log(
      `Senha redefinida pelo ADMIN: ${usuario.email} [${usuario.perfil}]`,
    );

    return { message: 'Senha redefinida com sucesso' };
  }

  // ─── Helpers privados ───────────────────────────────────────────

  /**
   * Busca dados do perfil específico (distribuidor ou vendedor) para
   * enriquecer a resposta de login do admin. Para ADMIN, retorna objeto vazio.
   */
  private async buscarDadosPerfil(
    usuarioId: string,
    perfil: string,
  ): Promise<Record<string, unknown>> {
    if (perfil === 'DISTRIBUIDOR') {
      const distribuidor = await this.prisma.distribuidor.findFirst({
        where: { usuarioId },
      });
      return { distribuidor };
    }

    if (perfil === 'VENDEDOR') {
      const vendedor = await this.prisma.vendedor.findFirst({
        where: { usuarioId },
        include: { distribuidor: { select: { id: true, nome: true } } },
      });
      return { vendedor };
    }

    return {};
  }

  private gerarTokens(usuario: UsuarioRow): AuthTokens {
    return {
      accessToken: this.gerarAccessToken(usuario),
      refreshToken: this.gerarRefreshToken(usuario),
    };
  }

  private gerarAccessToken(usuario: UsuarioRow): string {
    const payload: JwtPayload = {
      sub: usuario.id,
      perfil: usuario.perfil,
      email: usuario.email ?? undefined,
    };
    return this.jwtService.sign(payload, this.getAccessTokenOptions());
  }

  private gerarRefreshToken(usuario: UsuarioRow): string {
    const payload: JwtPayload = { sub: usuario.id, perfil: usuario.perfil };
    return this.jwtService.sign(payload, this.getRefreshTokenOptions());
  }

  private getAccessTokenOptions(): JwtSignOptions {
    return {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    };
  }

  private getRefreshTokenOptions(): JwtSignOptions {
    return {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>(
        'JWT_REFRESH_EXPIRES',
        '7d',
      ) as JwtSignOptions['expiresIn'],
    };
  }
}
