import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { StatusEdicao } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

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

  constructor(private readonly prisma: PrismaService) {}

  async iniciarSorteio(
    edicaoId: string,
  ): Promise<{ message: string; data: unknown }> {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
    });
    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== StatusEdicao.ENCERRADA) {
      throw new BadRequestException(
        'A edição precisa estar ENCERRADA para iniciar o sorteio',
      );
    }

    const edicaoAtualizada = await this.prisma.edicao.update({
      where: { id: edicaoId },
      data: { status: StatusEdicao.SORTEANDO },
    });

    this.logger.log(`Sorteio iniciado para edição ${edicaoId}`);
    return { message: 'Sorteio iniciado', data: edicaoAtualizada };
  }

  async marcarNumero(
    payload: MarcarNumeroPayload,
  ): Promise<MarcarNumeroResult> {
    const { edicaoId, numero, sequenciaBolas } = payload;

    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      include: { premios: true },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== StatusEdicao.SORTEANDO) {
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

    for (
      let i = 0;
      i < bilhetesGanhadores.length && i < premiosDisponiveis.length;
      i++
    ) {
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
        data: { status: StatusEdicao.FINALIZADA },
      });
      finalizado = true;
      statusAtualizado = StatusEdicao.FINALIZADA;
    }

    return { ganhadores, finalizado, statusAtualizado };
  }

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ message: string; data: unknown; meta: unknown }> {
    const pagination = normalizePagination(page, limit);
    const where = {
      status: { in: [StatusEdicao.SORTEANDO, StatusEdicao.FINALIZADA] },
    };

    const [edicoes, total] = await Promise.all([
      this.prisma.edicao.findMany({
        where,
        include: { resultado: true },
        orderBy: { dataSorteio: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.edicao.count({ where }),
    ]);

    return buildPaginatedResponse(
      edicoes,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Sorteios listados com sucesso',
        emptyMessage: 'Nenhum sorteio encontrado',
      },
    );
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
