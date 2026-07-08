import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { StatusEdicaoSena } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { S3UploadService } from '../../../common/s3/s3-upload.service';
import { InserirResultadoSenaDto } from './dto/inserir-resultado-sena.dto';

@Injectable()
export class SorteioSenaService {
  private readonly logger = new Logger(SorteioSenaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  // ─── INSERIR / ATUALIZAR RESULTADO ───────────────────

  async inserirResultado(
    edicaoSenaId: string,
    dto: InserirResultadoSenaDto,
  ) {
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

    this.validarNumerosSorteados(dto.numerosSorteados);
    this.validarSetimaBola(dto.numerosSorteados, dto.setimaBola);

    let imagemResultadoUrl = dto.imagemResultadoUrl?.trim() || null;
    if (dto.imagemBase64?.trim()) {
      try {
        imagemResultadoUrl = await this.s3UploadService.uploadImageFromBase64(
          dto.imagemBase64,
          `capital-sena/resultados/${edicaoSenaId}`,
        );
        this.logger.log(
          `Imagem do resultado enviada ao S3: ${imagemResultadoUrl}`,
        );
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw err;
        }

        this.logger.warn(
          `Falha ao enviar imagem do resultado ao S3: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const resultado = await this.prisma.resultadoSena.upsert({
      where: { edicaoSenaId },
      create: {
        edicaoSenaId,
        numerosSorteados: dto.numerosSorteados,
        setimaBola: dto.setimaBola ?? null,
        imagemResultadoUrl,
      },
      update: {
        numerosSorteados: dto.numerosSorteados,
        setimaBola: dto.setimaBola ?? null,
        // Só sobrescreve a imagem se uma nova foi enviada
        ...(imagemResultadoUrl !== null ? { imagemResultadoUrl } : {}),
        // Resetar apuração caso resultado seja corrigido
        apurado: false,
        apuradoEm: null,
      },
    });

    // Avançar status da edição para APURANDO
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

  // ─── CONSULTAR RESULTADO (admin) ──────────────────────

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
              setimaBola: edicao.resultado.setimaBola,
              imagemResultadoUrl: edicao.resultado.imagemResultadoUrl,
              apurado: edicao.resultado.apurado,
              apuradoEm: edicao.resultado.apuradoEm,
            }
          : null,
        premios: edicao.premios.map((p) => ({
          faixa: p.faixa,
          descricao: p.descricao,
          valor: p.valor.toString(),
          imagemUrl: p.imagemUrl,
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

  private validarSetimaBola(numerosSorteados: number[], setimaBola?: number): void {
    if (setimaBola === undefined || setimaBola === null) return;

    if (numerosSorteados.includes(setimaBola)) {
      throw new ConflictException(
        'A sétima bola não pode repetir um dos 6 números já sorteados',
      );
    }
  }
}
