import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { FiltroRangesDto } from './dto/filtro-ranges.dto';
import { Readable } from 'stream';
import * as readline from 'readline';
import * as ExcelJS from 'exceljs';

const MATRIZ_BATCH_SIZE = 5000;

type MatrizLinha = { numero: bigint; sequenciaBolas: number[] };

export interface MatrizStatus {
  status: 'sem_importacao_ativa';
  registrosNaMatriz: number;
  rangeInicio: string | null;
  rangeFinal: string | null;
}

export interface ImportacaoJob {
  jobId: string;
  status: 'em_andamento' | 'concluido' | 'erro';
  importados: number;
  /** null quando o total não é conhecido antecipadamente (XLSX) */
  total: number | null;
  /** null enquanto total for desconhecido; 100 quando concluído */
  porcentagem: number | null;
  rangeInicio: string | null;
  rangeFinal: string | null;
  erro?: string;
  criadoEm: Date;
  concluidoEm?: Date;
}

@Injectable()
export class RangesService {
  private readonly logger = new Logger(RangesService.name);
  private currentJob: ImportacaoJob | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ─── LISTAR MATRIZ ──────────────────────────────────────

  async findAll(filtros: FiltroRangesDto = {}) {
    this.logger.log('Listando matriz de range');
    const pagination = normalizePagination(
      filtros.page ?? 1,
      filtros.limit ?? 20,
    );
    const where = await this.buildWhereFromFiltros(filtros);

    const [data, total] = await Promise.all([
      this.prisma.matrizRange.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { numero: 'asc' },
      }),
      this.prisma.matrizRange.count({ where }),
    ]);

    return buildPaginatedResponse(
      data.map((item) => this.serializarMatriz(item)),
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Matriz de ranges listada com sucesso',
        emptyMessage: 'Nenhum registro na matriz de ranges',
      },
    );
  }

  async findOne(id: string) {
    const item = await this.prisma.matrizRange.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Registro não encontrado na matriz');
    return {
      message: 'Registro encontrado',
      data: this.serializarMatriz(item),
    };
  }

  // ─── IMPORTAR MATRIZ VIA CSV / XLSX ──────────────────────

  async importarMatriz(file: Express.Multer.File): Promise<{
    message: string;
    data: { jobId: string; status: string };
  }> {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo inválido ou vazio');
    }

    if (this.currentJob?.status === 'em_andamento') {
      throw new ConflictException(
        'Já existe uma importação em andamento. Aguarde a conclusão antes de enviar um novo arquivo.',
      );
    }

    const jobId = randomUUID();
    const job: ImportacaoJob = {
      jobId,
      status: 'em_andamento',
      importados: 0,
      total: null,
      porcentagem: null,
      rangeInicio: null,
      rangeFinal: null,
      criadoEm: new Date(),
    };
    this.currentJob = job;

    this.logger.log(
      `[Job ${jobId}] Criado — ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
    );

    // Fire-and-forget: não bloqueia a requisição
    this.executarImportacao(file, job).catch((err: Error) => {
      job.status = 'erro';
      job.erro = err.message;
      this.logger.error(`[Job ${jobId}] Falhou: ${err.message}`);
    });

    return {
      message: 'Importação iniciada. Consulte o status em GET /admin/ranges/matriz/upload/status.',
      data: { jobId, status: 'em_andamento' },
    };
  }

  async consultarStatusImportacao(): Promise<{
    message: string;
    data: ImportacaoJob | MatrizStatus;
  }> {
    if (this.currentJob) {
      const job = this.currentJob;
      let message: string;
      if (job.status === 'concluido') {
        message = `Importação concluída — ${job.importados.toLocaleString('pt-BR')} registros`;
      } else if (job.status === 'erro') {
        message = 'Importação falhou';
      } else if (job.porcentagem !== null) {
        message = `Importação em andamento — ${job.porcentagem}%`;
      } else {
        message = `Importação em andamento — ${job.importados.toLocaleString('pt-BR')} registros processados`;
      }
      return { message, data: job };
    }

    const agg = await this.prisma.matrizRange.aggregate({
      _count: { id: true },
      _min: { numero: true },
      _max: { numero: true },
    });

    const total = agg._count.id;
    const rangeInicio = agg._min.numero?.toString() ?? null;
    const rangeFinal = agg._max.numero?.toString() ?? null;

    const message =
      total === 0
        ? 'Nenhuma importação realizada. A matriz está vazia.'
        : `Matriz carregada com ${total.toLocaleString('pt-BR')} registros (range ${rangeInicio} – ${rangeFinal})`;

    return {
      message,
      data: { status: 'sem_importacao_ativa', registrosNaMatriz: total, rangeInicio, rangeFinal } satisfies MatrizStatus,
    };
  }

  // ─── HELPERS PRIVADOS ────────────────────────────────────

  private async executarImportacao(
    file: Express.Multer.File,
    job: ImportacaoJob,
  ): Promise<void> {
    this.logger.log(
      `[Job ${job.jobId}] Iniciando: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
    );

    let importados: number;

    if (this.isXlsx(file)) {
      // XLSX: total de linhas não é conhecido sem parse completo — porcentagem fica null até concluir
      importados = await this.parseXlsxEInserir(file.buffer, job);
    } else {
      // CSV: conta \n antes de começar para ter percentagem real
      job.total = this.contarLinhasCSV(file.buffer);
      importados = await this.parseCsvEInserir(file.buffer, job);
    }

    if (importados === 0) {
      throw new Error(
        'Nenhuma linha válida encontrada no arquivo. Formatos aceitos: CSV e XLSX.',
      );
    }

    job.status = 'concluido';
    job.importados = importados;
    job.porcentagem = 100;
    job.concluidoEm = new Date();

    this.logger.log(`[Job ${job.jobId}] Concluído: ${importados} registros`);
  }

  private contarLinhasCSV(buffer: Buffer): number {
    let count = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] === 0x0a) count++;
    }
    return count;
  }

  private atualizarRangeJob(
    job: ImportacaoJob,
    minNum: bigint,
    maxNum: bigint,
  ): void {
    if (job.rangeInicio === null || minNum < BigInt(job.rangeInicio)) {
      job.rangeInicio = minNum.toString();
    }
    if (job.rangeFinal === null || maxNum > BigInt(job.rangeFinal)) {
      job.rangeFinal = maxNum.toString();
    }
  }

  private isXlsx(file: Express.Multer.File): boolean {
    const xlsxMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/msexcel',
      'application/x-msexcel',
    ];
    const ext = (file.originalname ?? '').toLowerCase();
    return (
      xlsxMimes.includes(file.mimetype) ||
      ext.endsWith('.xlsx') ||
      ext.endsWith('.xls')
    );
  }

  private async parseXlsxEInserir(
    buffer: Buffer,
    job: ImportacaoJob,
  ): Promise<number> {
    const stream = Readable.from(buffer);
    const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
      entries: 'emit',
      sharedStrings: 'cache',
      styles: 'ignore',
      hyperlinks: 'ignore',
      worksheets: 'emit',
    });

    let importados = 0;
    let lote: MatrizLinha[] = [];
    let linhaAtual = 0;
    let loteNumero = 0;
    let minNum: bigint | null = null;
    let maxNum: bigint | null = null;

    const flushLote = async (loteAtual: MatrizLinha[], numero: number) => {
      if (loteAtual.length === 0) return;
      await this.executarInsertLote(loteAtual);
      importados += loteAtual.length;
      job.importados = importados;
      if (minNum !== null && maxNum !== null) {
        this.atualizarRangeJob(job, minNum, maxNum);
      }
      this.logger.log(
        `[Job ${job.jobId}] Lote XLSX ${numero} — ${importados} registros acumulados`,
      );
    };

    for await (const worksheetReader of workbookReader) {
      for await (const row of worksheetReader) {
        linhaAtual++;

        const colA = row.getCell(1).value;
        const colB = row.getCell(2).value;

        const numeroRaw = String(colA ?? '').trim();
        const bolasRaw = String(colB ?? '').trim();

        if (!numeroRaw || !bolasRaw) continue;
        if (isNaN(Number(numeroRaw))) continue;

        const sequenciaBolas = bolasRaw
          .split('-')
          .map((b) => parseInt(b.trim(), 10))
          .filter((n) => !isNaN(n) && n >= 1 && n <= 50);

        if (sequenciaBolas.length === 0) continue;

        try {
          const numero = BigInt(Math.round(Number(numeroRaw)));
          lote.push({ numero, sequenciaBolas });
          if (minNum === null || numero < minNum) minNum = numero;
          if (maxNum === null || numero > maxNum) maxNum = numero;
        } catch {
          this.logger.warn(`[Job ${job.jobId}] Linha XLSX ${linhaAtual} inválida, ignorada`);
        }

        if (lote.length >= MATRIZ_BATCH_SIZE) {
          loteNumero++;
          await flushLote(lote, loteNumero);
          lote = [];
        }
      }

      if (lote.length > 0) {
        loteNumero++;
        await flushLote(lote, loteNumero);
        lote = [];
      }

      break;
    }

    return importados;
  }

  private parseCsvEInserir(
    buffer: Buffer,
    job: ImportacaoJob,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const stream = Readable.from(buffer);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      let lote: MatrizLinha[] = [];
      let importados = 0;
      let linhaAtual = 0;
      let loteNumero = 0;
      let minNum: bigint | null = null;
      let maxNum: bigint | null = null;
      let insertPromise: Promise<void> = Promise.resolve();

      const processarLinha = (raw: string): MatrizLinha | null => {
        const partes = raw.split(/[,;\t]/).map((p) => p.trim());
        let colA: string;
        let colB: string;

        if (partes.length >= 2) {
          colA = partes[0];
          colB = partes.slice(1).join('-');
        } else {
          const espaco = raw.indexOf(' ');
          if (espaco < 0) return null;
          colA = raw.slice(0, espaco).trim();
          colB = raw.slice(espaco + 1).trim();
        }

        if (!colA || !colB || isNaN(Number(colA))) return null;

        const sequenciaBolas = colB
          .split('-')
          .map((b) => parseInt(b.trim(), 10))
          .filter((n) => !isNaN(n) && n >= 1 && n <= 50);

        if (sequenciaBolas.length === 0) return null;

        return { numero: BigInt(colA), sequenciaBolas };
      };

      const flushLote = (loteAtual: MatrizLinha[], numero: number) => {
        const loteMin = minNum;
        const loteMax = maxNum;
        insertPromise = insertPromise
          .then(async () => {
            await this.executarInsertLote(loteAtual);
            importados += loteAtual.length;
            job.importados = importados;
            if (loteMin !== null && loteMax !== null) {
              this.atualizarRangeJob(job, loteMin, loteMax);
            }
            if (job.total !== null && job.total > 0) {
              job.porcentagem = Math.min(
                99,
                Math.round((importados / job.total) * 100),
              );
            }
            this.logger.log(
              `[Job ${job.jobId}] Lote CSV ${numero} — ${importados}${job.total ? `/${job.total}` : ''} (${job.porcentagem ?? '?'}%)`,
            );
          })
          .catch(reject);
      };

      rl.on('line', (line) => {
        linhaAtual++;
        const raw = line.trim();
        if (!raw) return;

        try {
          const linha = processarLinha(raw);
          if (!linha) return;
          lote.push(linha);
          if (minNum === null || linha.numero < minNum) minNum = linha.numero;
          if (maxNum === null || linha.numero > maxNum) maxNum = linha.numero;

          if (lote.length >= MATRIZ_BATCH_SIZE) {
            loteNumero++;
            flushLote(lote, loteNumero);
            lote = [];
          }
        } catch {
          this.logger.warn(`[Job ${job.jobId}] Linha CSV ${linhaAtual} inválida, ignorada`);
        }
      });

      rl.on('close', () => {
        if (lote.length > 0) {
          loteNumero++;
          flushLote(lote, loteNumero);
        }
        insertPromise.then(() => resolve(importados)).catch(reject);
      });

      rl.on('error', reject);
    });
  }

  private async executarInsertLote(lote: MatrizLinha[]): Promise<void> {
    if (lote.length === 0) return;
    const values = lote
      .map(
        (l) =>
          `(gen_random_uuid(), ${l.numero}, ARRAY[${l.sequenciaBolas.join(',')}]::int[])`,
      )
      .join(',');

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "MatrizRange" (id, numero, "sequenciaBolas")
       VALUES ${values}
       ON CONFLICT (numero) DO UPDATE
       SET "sequenciaBolas" = EXCLUDED."sequenciaBolas"`,
    );
  }

  private async buildWhereFromFiltros(
    filtros: FiltroRangesDto,
  ): Promise<Prisma.MatrizRangeWhereInput> {
    const and: Prisma.MatrizRangeWhereInput[] = [];

    if (filtros.numeroInicio !== undefined || filtros.numeroFim !== undefined) {
      const numero: Prisma.BigIntFilter = {};

      if (filtros.numeroInicio !== undefined) {
        numero.gte = BigInt(filtros.numeroInicio);
      }

      if (filtros.numeroFim !== undefined) {
        numero.lte = BigInt(filtros.numeroFim);
      }

      and.push({ numero });
    }

    if (filtros.edicaoId) {
      const edicao = await this.prisma.edicao.findUnique({
        where: { id: filtros.edicaoId },
        select: {
          id: true,
          createdAt: true,
          combos: { select: { rangeInicio: true, rangeFinal: true } },
          rangeInicio: true,
          rangeFinal: true,
        },
      });

      if (!edicao) {
        throw new NotFoundException('Edição não encontrada');
      }

      if (edicao.combos.length > 0) {
        and.push({
          OR: edicao.combos.map((combo) => ({
            numero: { gte: combo.rangeInicio, lte: combo.rangeFinal },
          })),
        });
      } else {
        and.push({
          numero: { gte: edicao.rangeInicio, lte: edicao.rangeFinal },
        });
      }
    }

    if (and.length === 0) {
      return {};
    }

    if (and.length === 1) {
      return and[0];
    }

    return { AND: and };
  }

  private serializarMatriz(item: {
    id: string;
    numero: bigint;
    sequenciaBolas: number[];
  }) {
    return {
      ...item,
      numero: item.numero.toString(),
    };
  }
}
