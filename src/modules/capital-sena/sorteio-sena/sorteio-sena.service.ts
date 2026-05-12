import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusEdicaoSena } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { InserirResultadoSenaDto } from './dto/inserir-resultado-sena.dto';

@Injectable()
export class SorteioSenaService {
  private readonly logger = new Logger(SorteioSenaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── INSERIR RESULTADO ────────────────────────────────

  async inserirResultado(edicaoSenaId: string, dto: InserirResultadoSenaDto) {
    const edicao = await this.prisma.edicaoSena.findUnique({
      where: { id: edicaoSenaId },
    });
    if (!edicao) throw new NotFoundException('Edição Sena não encontrada');

    if (
      edicao.status !== StatusEdicaoSena.ENCERRADA &&
      edicao.status !== StatusEdicaoSena.APURANDO
    ) {
      throw new BadRequestException(
        'Só é possível inserir resultado em edições ENCERRADAS ou em APURANDO',
      );
    }

    // Validar 6 números únicos entre 1 e 60
    this.validarNumerosSorteados(dto.numerosSorteados);

    // Upsert do resultado
    const resultado = await this.prisma.resultadoSena.upsert({
      where: { edicaoSenaId },
      create: {
        edicaoSenaId,
        numerosSorteados: dto.numerosSorteados,
        imagemResultadoUrl: dto.imagemResultadoUrl ?? null,
      },
      update: {
        numerosSorteados: dto.numerosSorteados,
        ...(dto.imagemResultadoUrl !== undefined
          ? { imagemResultadoUrl: dto.imagemResultadoUrl }
          : {}),
        // Se editando resultado já apurado, resetar apuração
        apurado: false,
        apuradoEm: null,
      },
    });

    // Avançar status para APURANDO se ainda ENCERRADA
    if (edicao.status === StatusEdicaoSena.ENCERRADA) {
      await this.prisma.edicaoSena.update({
        where: { id: edicaoSenaId },
        data: { status: StatusEdicaoSena.APURANDO },
      });
    }

    this.logger.log(
      `Resultado Sena inserido na edição ${edicaoSenaId}: [${dto.numerosSorteados.join(', ')}]`,
    );

    return {
      message: 'Resultado da Mega-Sena inserido com sucesso',
      data: resultado,
    };
  }

  // ─── CONSULTAR RESULTADO ──────────────────────────────

  async consultarResultado(edicaoSenaId: string) {
    const edicao = await this.prisma.edicaoSena.findUnique({
      where: { id: edicaoSenaId },
      include: { resultado: true },
    });
    if (!edicao) throw new NotFoundException('Edição Sena não encontrada');

    return {
      message: edicao.resultado ? 'Resultado encontrado' : 'Resultado ainda não inserido',
      data: {
        edicaoSenaId,
        edicaoNumero: edicao.numero,
        status: edicao.status,
        resultado: edicao.resultado,
      },
    };
  }

  // ─── RESULTADO PÚBLICO ────────────────────────────────

  async consultarResultadoPublico(edicaoSenaId: string) {
    const edicao = await this.prisma.edicaoSena.findUnique({
      where: { id: edicaoSenaId },
      include: {
        resultado: true,
        premios: true,
      },
    });
    if (!edicao) throw new NotFoundException('Edição Sena não encontrada');

    return {
      message: 'Resultado Sena',
      data: {
        edicaoNumero: edicao.numero,
        descricao: edicao.descricao,
        dataSorteioMegaSena: edicao.dataSorteioMegaSena,
        status: edicao.status,
        resultado: edicao.resultado
          ? {
              numerosSorteados: edicao.resultado.numerosSorteados,
              imagemResultadoUrl: edicao.resultado.imagemResultadoUrl,
              apurado: edicao.resultado.apurado,
              apuradoEm: edicao.resultado.apuradoEm,
            }
          : null,
        premios: edicao.premios.map((p) => ({
          faixa: p.faixa,
          descricao: p.descricao,
          valor: p.valor.toString(),
        })),
      },
    };
  }

  // ─── HELPERS ──────────────────────────────────────────

  private validarNumerosSorteados(numeros: number[]): void {
    if (numeros.length !== 6) {
      throw new BadRequestException('O resultado deve conter exatamente 6 números');
    }
    if (new Set(numeros).size !== 6) {
      throw new ConflictException('Os números do resultado não podem se repetir');
    }
    if (numeros.some((n) => n < 1 || n > 60)) {
      throw new BadRequestException('Os números do resultado devem estar entre 1 e 60');
    }
  }
}
