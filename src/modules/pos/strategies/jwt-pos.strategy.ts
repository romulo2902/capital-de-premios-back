import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

export interface PosJwtPayload {
  sub: string;
  perfil: string;
  cpf?: string;
  origem: 'POS';
}

/**
 * Estratégia JWT exclusiva do canal POS (passport name `jwt-pos`).
 *
 * O token do POS é isolado do painel admin (secret próprio + flag `origem: POS`)
 * para que a sessão longa do terminal não conceda acesso às rotas administrativas.
 * Aceita apenas VENDEDOR e DISTRIBUIDOR.
 */
@Injectable()
export class JwtPosStrategy extends PassportStrategy(Strategy, 'jwt-pos') {
  private static readonly PERFIS_POS: ReadonlySet<string> = new Set([
    'VENDEDOR',
    'DISTRIBUIDOR',
  ]);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_POS_SECRET', 'pos-secret'),
    });
  }

  async validate(payload: PosJwtPayload): Promise<RequestUser> {
    if (payload.origem !== 'POS') {
      throw new UnauthorizedException('Token inválido para o canal POS');
    }

    if (!JwtPosStrategy.PERFIS_POS.has(payload.perfil)) {
      throw new UnauthorizedException('Acesso restrito ao POS');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
    });
    if (!usuario || usuario.status === 'INATIVO') {
      throw new UnauthorizedException('Token inválido');
    }

    const user: RequestUser = {
      id: usuario.id,
      email: usuario.email,
      cpf: usuario.cpf,
      perfil: usuario.perfil,
      status: usuario.status,
    };

    if (usuario.perfil === 'DISTRIBUIDOR') {
      const dist = await this.prisma.distribuidor.findFirst({
        where: { usuarioId: usuario.id },
        select: { id: true },
      });
      if (dist) user.distribuidorId = dist.id;
    } else if (usuario.perfil === 'VENDEDOR') {
      const vend = await this.prisma.vendedor.findFirst({
        where: { usuarioId: usuario.id },
        select: { id: true },
      });
      if (vend) user.vendedorId = vend.id;
    }

    return user;
  }
}
