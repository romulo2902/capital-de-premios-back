import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../auth.service';

export interface RequestUser {
  id: string;
  email: string | null;
  cpf: string | null;
  perfil: string;
  status: string;
  // populated for DISTRIBUIDOR/VENDEDOR tokens
  distribuidorId?: string;
  vendedorId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET', 'secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    // CLIENTE não tem registro em Usuario
    if (payload.perfil === 'CLIENTE') {
      const cliente = await this.prisma.cliente.findUnique({ where: { id: payload.sub } });
      if (!cliente || cliente.status === 'INATIVO') throw new UnauthorizedException('Token inválido');
      return {
        id: cliente.id,
        email: cliente.email ?? null,
        cpf: cliente.cpf,
        perfil: 'CLIENTE',
        status: cliente.status,
      };
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
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

    // Injetar distribuidorId ou vendedorId para isolamento de dados
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
