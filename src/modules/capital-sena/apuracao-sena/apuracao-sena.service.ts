import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { StatusCartelaSena, StatusEdicaoSena } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../../common/utils/pagination.util';

export interface ResumoApuracao {
  edicaoSenaId: string;
  edicaoNumero: string;
  totalCartelas: number;
  naoPremidas: number;
  quadras: number;
  quinas: number;
  senas: number;
  senaBonus: number;
  numerosSorteados: number[];
}

@Injectable()
export class ApuracaoSenaService {
  private readonly logger = new Logger(ApuracaoSenaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── APURAR ────────────────────────────────────────────

  async apurar(edicaoSenaId: string): Promise<{ message: string; data: ResumoApuracao }> {
    // 1. Buscar edição e resultado
    const edicao = await this.prisma.edicaoSena.findUnique({
      where: { id: edicaoSenaId },
      include: { resultado: true },
    });
    if (!edicao) throw new NotFoundException('Edição Sena não encontrada');

    if (edicao.status !== StatusEdicaoSena.APURANDO) {
      throw new BadRequestException(
        'A edição precisa estar em status APURANDO para iniciar a apuração',
      );
    }

    if (!edicao.resultado) {
      throw new BadRequestException(
        'É necessário inserir o resultado da Mega-Sena antes de apurar',
      );
    }

    if (edicao.resultado.apurado) {
      throw new ConflictException('Esta edição já foi apurada');
    }

    const sorteados = new Set(edicao.resultado.numerosSorteados);

    // 2. Buscar todas as cartelas CONFIRMADAS
    const cartelas = await this.prisma.cartelaSena.findMany({
      where: { edicaoSenaId, status: StatusCartelaSena.CONFIRMADA },
    });

    this.logger.log(
      `Iniciando apuração da edição Sena "${edicao.numero}" — ${cartelas.length} cartelas`,
    );

    // 3. Avaliar cada cartela e atualizar status
    const contadores = {
      naoPremidas: 0,
      quadras: 0,
      quinas: 0,
      senas: 0,
      senaBonus: 0,
    };

    for (const cartela of cartelas) {
      const acertos = cartela.numerosEscolhidos.filter((n) => sorteados.has(n)).length;

      let setimoAcertou = false;
      let status: StatusCartelaSena;

      if (acertos === 6) {
        const bolaBonus = edicao.resultado.setimaBola;
        setimoAcertou =
          cartela.setimoNumero !== null &&
          (bolaBonus !== null
            ? cartela.setimoNumero === bolaBonus
            : sorteados.has(cartela.setimoNumero));
        status = setimoAcertou
          ? StatusCartelaSena.SENA_BONUS
          : StatusCartelaSena.SENA;
      } else if (acertos === 5) {
        status = StatusCartelaSena.QUINA;
      } else if (acertos === 4) {
        status = StatusCartelaSena.QUADRA;
      } else {
        status = StatusCartelaSena.NAO_PREMIADA;
      }

      // Atualizar no banco
      await this.prisma.cartelaSena.update({
        where: { id: cartela.id },
        data: { acertos, setimoAcertou, status },
      });

      // Contadores
      if (status === StatusCartelaSena.NAO_PREMIADA) contadores.naoPremidas++;
      else if (status === StatusCartelaSena.QUADRA) contadores.quadras++;
      else if (status === StatusCartelaSena.QUINA) contadores.quinas++;
      else if (status === StatusCartelaSena.SENA) contadores.senas++;
      else if (status === StatusCartelaSena.SENA_BONUS) contadores.senaBonus++;
    }

    // 4. Marcar resultado como apurado e edição como FINALIZADA
    await this.prisma.$transaction([
      this.prisma.resultadoSena.update({
        where: { edicaoSenaId },
        data: { apurado: true, apuradoEm: new Date() },
      }),
      this.prisma.edicaoSena.update({
        where: { id: edicaoSenaId },
        data: { status: StatusEdicaoSena.FINALIZADA },
      }),
    ]);

    this.logger.log(
      `Apuração concluída para edição Sena "${edicao.numero}": ` +
        `Quadra=${contadores.quadras} | Quina=${contadores.quinas} | Sena=${contadores.senas} | SenaBonus=${contadores.senaBonus}`,
    );

    const resumo: ResumoApuracao = {
      edicaoSenaId,
      edicaoNumero: edicao.numero,
      totalCartelas: cartelas.length,
      ...contadores,
      numerosSorteados: edicao.resultado.numerosSorteados,
    };

    return { message: 'Apuração concluída com sucesso', data: resumo };
  }

  // ─── RESUMO ────────────────────────────────────────────

  async resumo(edicaoSenaId: string): Promise<{ message: string; data: ResumoApuracao }> {
    const edicao = await this.prisma.edicaoSena.findUnique({
      where: { id: edicaoSenaId },
      include: { resultado: true },
    });
    if (!edicao) throw new NotFoundException('Edição Sena não encontrada');
    if (!edicao.resultado?.apurado) {
      throw new BadRequestException('Esta edição ainda não foi apurada');
    }

    const [total, naoPremidas, quadras, quinas, senas, senaBonus] = await Promise.all([
      this.prisma.cartelaSena.count({ where: { edicaoSenaId } }),
      this.prisma.cartelaSena.count({ where: { edicaoSenaId, status: StatusCartelaSena.NAO_PREMIADA } }),
      this.prisma.cartelaSena.count({ where: { edicaoSenaId, status: StatusCartelaSena.QUADRA } }),
      this.prisma.cartelaSena.count({ where: { edicaoSenaId, status: StatusCartelaSena.QUINA } }),
      this.prisma.cartelaSena.count({ where: { edicaoSenaId, status: StatusCartelaSena.SENA } }),
      this.prisma.cartelaSena.count({ where: { edicaoSenaId, status: StatusCartelaSena.SENA_BONUS } }),
    ]);

    return {
      message: 'Resumo da apuração',
      data: {
        edicaoSenaId,
        edicaoNumero: edicao.numero,
        totalCartelas: total,
        naoPremidas,
        quadras,
        quinas,
        senas,
        senaBonus,
        numerosSorteados: edicao.resultado.numerosSorteados,
      },
    };
  }

  // ─── GANHADORES ───────────────────────────────────────

  async listarGanhadores(edicaoSenaId: string, page = 1, limit = 20) {
    const pagination = normalizePagination(page, limit);

    const where = {
      edicaoSenaId,
      status: {
        in: [
          StatusCartelaSena.QUADRA,
          StatusCartelaSena.QUINA,
          StatusCartelaSena.SENA,
          StatusCartelaSena.SENA_BONUS,
        ],
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.cartelaSena.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ status: 'desc' }, { acertos: 'desc' }],
        include: {
          vendaSena: {
            select: {
              cliente: { select: { nome: true, cpf: true, telefone: true } },
              vendedor: { select: { nome: true, codigo: true } },
            },
          },
        },
      }),
      this.prisma.cartelaSena.count({ where }),
    ]);

    return buildPaginatedResponse(
      data.map((c) => ({
        cartelaId: c.id,
        status: c.status,
        acertos: c.acertos,
        setimoAcertou: c.setimoAcertou,
        numerosEscolhidos: c.numerosEscolhidos,
        setimoNumero: c.setimoNumero,
        cliente: c.vendaSena.cliente,
        vendedor: c.vendaSena.vendedor,
      })),
      total,
      pagination.page,
      pagination.limit,
      { successMessage: 'Ganhadores listados com sucesso', emptyMessage: 'Nenhum ganhador encontrado' },
    );
  }
}
