import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { expandirSetoresDosDetalhes } from '../edicoes/edicoes-range.util';
import { FiltroRangesDto } from './dto/filtro-ranges.dto';
import { Readable } from 'stream';
import * as readline from 'readline';
import * as XLSX from 'xlsx';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';

const MATRIZ_BATCH_SIZE = 5000;

type MatrizLinha = { numero: bigint; sequenciaBolas: number[] };

@Injectable()
export class RangesService {
  private readonly logger = new Logger(RangesService.name);

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
    data: { importados: number; total: number };
  }> {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo inválido ou vazio');
    }

    this.logger.log(
      `Iniciando importação de matriz: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
    );

    let importados = 0;

    if (this.isXlsx(file)) {
      // XLSX: carrega em memória (SheetJS não tem streaming)
      if (file.size > 50 * 1024 * 1024) {
        this.logger.warn(
          `Arquivo XLSX grande (${(file.size / 1024 / 1024).toFixed(0)} MB). ` +
            `Para arquivos com mais de 100k linhas, prefira CSV para evitar alto consumo de memória.`,
        );
      }

      const linhas = this.parseXlsx(file.buffer);

      if (linhas.length === 0) {
        throw new BadRequestException(
          'Nenhuma linha válida encontrada no arquivo XLSX.',
        );
      }

      this.logger.log(
        `XLSX: ${linhas.length} linhas válidas. Iniciando inserção...`,
      );
      importados = await this.inserirEmLotes(linhas);
    } else {
      // CSV: streaming real — insere enquanto lê, sem acumular tudo na memória
      importados = await this.parseCsvEInserir(file.buffer);
    }

    if (importados === 0) {
      throw new BadRequestException(
        'Nenhuma linha válida encontrada no arquivo. Formatos aceitos: CSV e XLSX.',
      );
    }

    this.logger.log(`Importação concluída: ${importados} registros`);

    return {
      message: `Matriz importada com sucesso. ${importados} registros processados.`,
      data: { importados, total: importados },
    };
  }

  // ─── HELPERS PRIVADOS ────────────────────────────────────

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

  private parseXlsx(buffer: Buffer): MatrizLinha[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Exporta como array de arrays (valores brutos)
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    const linhas: MatrizLinha[] = [];
    let linhaAtual = 0;

    for (const row of rows) {
      linhaAtual++;
      if (!row || row.length < 2) continue;

      try {
        const colA = String(row[0] ?? '').trim();
        const colB = String(row[1] ?? '').trim();

        if (!colA || !colB) continue;

        // Ignora cabeçalhos textuais
        if (isNaN(Number(colA))) continue;

        const numero = BigInt(Math.round(Number(colA)));
        const sequenciaBolas = colB
          .split('-')
          .map((b) => parseInt(b.trim(), 10))
          .filter((n) => !isNaN(n) && n >= 1 && n <= 50);

        if (sequenciaBolas.length === 0) continue;

        linhas.push({ numero, sequenciaBolas });
      } catch {
        this.logger.warn(`Linha XLSX ${linhaAtual} inválida, ignorada`);
      }
    }

    this.logger.log(`XLSX parseado: ${linhas.length} linhas válidas`);
    return linhas;
  }

  // Insere em lotes de MATRIZ_BATCH_SIZE — usado pelo fluxo XLSX
  private async inserirEmLotes(linhas: MatrizLinha[]): Promise<number> {
    let importados = 0;
    for (let i = 0; i < linhas.length; i += MATRIZ_BATCH_SIZE) {
      const lote = linhas.slice(i, i + MATRIZ_BATCH_SIZE);
      await this.executarInsertLote(lote);
      importados += lote.length;
      this.logger.log(
        `Lote ${Math.ceil((i + 1) / MATRIZ_BATCH_SIZE)} / ${Math.ceil(linhas.length / MATRIZ_BATCH_SIZE)} — ${importados}/${linhas.length} inseridos`,
      );
    }
    return importados;
  }

  // Parse CSV com streaming real: insere cada lote durante a leitura, sem acumular tudo na memória
  private parseCsvEInserir(buffer: Buffer): Promise<number> {
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
      // Fila de promises de insert para não explodir conexões simultâneas
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
        // Encadeia o insert na fila de promises (sequencial, sem explodir conexões)
        insertPromise = insertPromise
          .then(async () => {
            await this.executarInsertLote(loteAtual);
            importados += loteAtual.length;
            this.logger.log(
              `Lote CSV ${numero} inserido — ${importados} registros acumulados`,
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

          if (lote.length >= MATRIZ_BATCH_SIZE) {
            loteNumero++;
            flushLote(lote, loteNumero);
            lote = [];
          }
        } catch {
          this.logger.warn(`Linha CSV ${linhaAtual} inválida, ignorada`);
        }
      });

      rl.on('close', () => {
        // Flush lote final
        if (lote.length > 0) {
          loteNumero++;
          flushLote(lote, loteNumero);
        }
        // Aguarda todos os inserts concluírem antes de resolver
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
          detalhes: true,
          rangeInicio: true,
          rangeFinal: true,
        },
      });

      if (!edicao) {
        throw new NotFoundException('Edição não encontrada');
      }

      const detalhes =
        edicao.detalhes.length > 0
          ? edicao.detalhes.map((detalhe) => ({
              origemParticipacao: detalhe.origemParticipacao,
              tipoCartela: detalhe.tipoCartela,
              rangeInicio: detalhe.rangeInicio,
              rangeFinal: detalhe.rangeFinal,
            }))
          : [
              {
                origemParticipacao: OrigemParticipacao.DIGITAL,
                tipoCartela: TipoCartela.UMA_CHANCE,
                rangeInicio: edicao.rangeInicio,
                rangeFinal: edicao.rangeFinal,
              },
            ];

      const setores = expandirSetoresDosDetalhes(detalhes);

      and.push({
        OR: setores.map((setor) => ({
          numero: {
            gte: setor.rangeInicio,
            lte: setor.rangeFinal,
          },
        })),
      });
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
