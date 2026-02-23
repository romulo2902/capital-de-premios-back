import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

// Use string constants to avoid enum import issues in strict mode
const STATUS = {
  SORTEANDO: 'SORTEANDO',
  FINALIZADA: 'FINALIZADA',
  ENCERRADA: 'ENCERRADA',
} as const;

interface MarcarNumeroPayload {
  edicaoId: string;
  numero: number;
  sequenciaBolas: number[];
}

interface GanhadorInfo {
  bilheteId: string;
  clienteId: string;
  premioDescricao: string;
}

interface MarcarNumeroResult {
  ganhadores: GanhadorInfo[];
  finalizado: boolean;
  statusAtualizado?: string;
}

interface PremioInfo {
  id: string;
  ordem: number;
  descricao: string;
  valor: unknown;
  ganhadorBilheteId: string | null;
}

@Injectable()
export class SorteioService {
  private readonly logger = new Logger(SorteioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validarToken(token: string): Promise<{ id: string; perfil: string } | null> {
    try {
      const tokenLimpo = token.startsWith('Bearer ') ? token.slice(7) : token;
      const payload = this.jwtService.verify<{ sub: string; perfil: string }>(tokenLimpo, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      const usuario = await this.prisma.usuario.findUnique({ where: { id: payload.sub } });
      if (!usuario || usuario.status === 'INATIVO') return null;
      return { id: usuario.id, perfil: usuario.perfil };
    } catch {
      return null;
    }
  }

  async iniciarSorteio(edicaoId: string): Promise<{ message: string; data: unknown }> {
    const edicao = await this.prisma.edicao.findUnique({ where: { id: edicaoId } });
    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== STATUS.ENCERRADA) {
      throw new BadRequestException('A edição precisa estar ENCERRADA para iniciar o sorteio');
    }

    const edicaoAtualizada = await this.prisma.edicao.update({
      where: { id: edicaoId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: STATUS.SORTEANDO as any },
    });

    this.logger.log(`Sorteio iniciado para edição ${edicaoId}`);
    return { message: 'Sorteio iniciado', data: edicaoAtualizada };
  }

  async marcarNumero(payload: MarcarNumeroPayload): Promise<MarcarNumeroResult> {
    const { edicaoId, numero, sequenciaBolas } = payload;

    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      include: { premios: true },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== STATUS.SORTEANDO) {
      throw new BadRequestException('Edição não está em status de sorteio');
    }

    // Persist result number
    await this.prisma.resultado.upsert({
      where: { edicaoId },
      create: { edicaoId, numerosApurados: [numero] },
      update: { numerosApurados: { push: numero } },
    });

    // Check for winning tickets
    const bilhetesGanhadores = await this.prisma.bilhete.findMany({
      where: {
        venda: { edicaoId },
        sequenciaBolas: { equals: sequenciaBolas },
        ganhador: false,
      },
      include: { venda: { include: { cliente: true } } },
    });

    const ganhadores: GanhadorInfo[] = [];
    const premiosDisponiveis = (edicao.premios as PremioInfo[])
      .filter((p) => !p.ganhadorBilheteId)
      .sort((a, b) => a.ordem - b.ordem);

    for (let i = 0; i < bilhetesGanhadores.length && i < premiosDisponiveis.length; i++) {
      const bilhete = bilhetesGanhadores[i];
      const premio = premiosDisponiveis[i];

      await this.prisma.$transaction([
        this.prisma.bilhete.update({
          where: { id: bilhete.id },
          data: { ganhador: true, premioId: premio.id },
        }),
        this.prisma.premio.update({
          where: { id: premio.id },
          data: { ganhadorBilheteId: bilhete.id },
        }),
      ]);

      ganhadores.push({
        bilheteId: bilhete.id,
        clienteId: bilhete.venda.clienteId,
        premioDescricao: premio.descricao,
      });
    }

    // Check if sorteio is complete (all prizes awarded)
    const premiosRestantes = await this.prisma.premio.count({
      where: { edicaoId, ganhadorBilheteId: null },
    });

    let finalizado = false;
    let statusAtualizado: string | undefined;

    if (premiosRestantes === 0) {
      await this.prisma.edicao.update({
        where: { id: edicaoId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: STATUS.FINALIZADA as any },
      });
      finalizado = true;
      statusAtualizado = STATUS.FINALIZADA;
    }

    return { ganhadores, finalizado, statusAtualizado };
  }

  async findAll(): Promise<{ message: string; data: unknown }> {
    const edicoes = await this.prisma.edicao.findMany({
      where: { status: { in: [STATUS.SORTEANDO as never, STATUS.FINALIZADA as never] } },
      include: { resultado: true },
    });
    return { message: 'Sorteios listados', data: edicoes };
  }

  async findOne(id: string): Promise<{ message: string; data: unknown }> {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id },
      include: { resultado: true, premios: true },
    });
    if (!edicao) throw new NotFoundException('Edição não encontrada');
    return { message: 'Sorteio encontrado', data: edicao };
  }
}
