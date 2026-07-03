import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StatusUsuario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { LoginPosDto } from './dto/login-pos.dto';
import type { PosJwtPayload } from './strategies/jwt-pos.strategy';

interface OperadorPos {
  usuarioId: string;
  perfil: 'VENDEDOR' | 'DISTRIBUIDOR';
  cpf: string;
  nome: string;
  status: StatusUsuario;
  vendedorId?: string;
  distribuidorId?: string;
}

/**
 * Autenticação do canal POS — login apenas por CPF (sem senha), exclusivo para
 * VENDEDOR e DISTRIBUIDOR. Emite um token de sessão longa (env `JWT_POS_EXPIRES`),
 * isolado do painel admin pelo secret próprio e pela flag `origem: POS`.
 */
@Injectable()
export class PosAuthService {
  private readonly logger = new Logger(PosAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginPosDto): Promise<{ message: string; data: unknown }> {
    const cpfLimpo = dto.cpf.replace(/\D/g, '');
    const operador = await this.resolverOperadorPorCpf(cpfLimpo);

    if (!operador) {
      throw new UnauthorizedException(
        'CPF não vinculado a um vendedor ou distribuidor',
      );
    }

    if (operador.status === StatusUsuario.INATIVO) {
      throw new UnauthorizedException('Operador inativo');
    }

    const payload: PosJwtPayload = {
      sub: operador.usuarioId,
      perfil: operador.perfil,
      cpf: operador.cpf,
      origem: 'POS',
    };
    const accessToken = this.jwtService.sign(payload, this.getPosTokenOptions());

    this.logger.log(`Login POS: CPF ${cpfLimpo} [${operador.perfil}]`);

    return {
      message: 'Login realizado com sucesso',
      data: {
        accessToken,
        perfil: operador.perfil,
        operador: {
          nome: operador.nome,
          cpf: operador.cpf,
          perfil: operador.perfil,
          vendedorId: operador.vendedorId,
          distribuidorId: operador.distribuidorId,
        },
      },
    };
  }

  private async resolverOperadorPorCpf(
    cpf: string,
  ): Promise<OperadorPos | null> {
    const vendedor = await this.prisma.vendedor.findUnique({
      where: { cpf },
      select: {
        id: true,
        usuarioId: true,
        nome: true,
        cpf: true,
        status: true,
        distribuidorId: true,
      },
    });
    if (vendedor) {
      return {
        usuarioId: vendedor.usuarioId,
        perfil: 'VENDEDOR',
        cpf: vendedor.cpf,
        nome: vendedor.nome,
        status: vendedor.status,
        vendedorId: vendedor.id,
        distribuidorId: vendedor.distribuidorId,
      };
    }

    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { cpf },
      select: {
        id: true,
        usuarioId: true,
        nome: true,
        cpf: true,
        status: true,
      },
    });
    if (distribuidor) {
      return {
        usuarioId: distribuidor.usuarioId,
        perfil: 'DISTRIBUIDOR',
        cpf: distribuidor.cpf,
        nome: distribuidor.nome,
        status: distribuidor.status,
        distribuidorId: distribuidor.id,
      };
    }

    return null;
  }

  private getPosTokenOptions(): JwtSignOptions {
    return {
      secret: this.config.get<string>('JWT_POS_SECRET', 'pos-secret'),
      expiresIn: this.config.get<string>(
        'JWT_POS_EXPIRES',
        '180d',
      ) as JwtSignOptions['expiresIn'],
    };
  }
}
