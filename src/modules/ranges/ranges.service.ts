import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { FiltroRangesDto } from './dto/filtro-ranges.dto';

@Injectable()
export class RangesService {
  private readonly logger = new Logger(RangesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filtros: FiltroRangesDto = {}) {
    this.logger.log('Listando range');
    const pagination = normalizePagination(filtros.page ?? 1, filtros.limit ?? 20);
    const where = await this.buildWhereFromFiltros(filtros);

    const [data, total] = await Promise.all([
      this.prisma.range.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { numero: 'asc' },
      }),
      this.prisma.range.count({ where }),
    ]);

    return buildPaginatedResponse(
      data.map((item) => this.serializarRange(item)),
      total,
      pagination.page,
      pagination.limit,
      {
      successMessage: 'Ranges listados com sucesso',
      emptyMessage: 'Nenhum range encontrado',
      },
    );
  }

  async findOne(id: string) {
    const item = await this.prisma.range.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Ranges não encontrado');
    return { message: 'Ranges encontrado', data: this.serializarRange(item) };
  }

  private async buildWhereFromFiltros(
    filtros: FiltroRangesDto,
  ): Promise<Prisma.RangeWhereInput> {
    const where: Prisma.RangeWhereInput = {};

    if (filtros.disponivel !== undefined) {
      where.disponivel = filtros.disponivel;
    }

    if (filtros.numeroInicio !== undefined || filtros.numeroFim !== undefined) {
      where.numero = {};

      if (filtros.numeroInicio !== undefined) {
        where.numero.gte = BigInt(filtros.numeroInicio);
      }

      if (filtros.numeroFim !== undefined) {
        where.numero.lte = BigInt(filtros.numeroFim);
      }
    }

    if (filtros.edicaoId) {
      const edicao = await this.prisma.edicao.findUnique({
        where: { id: filtros.edicaoId },
        select: {
          rangeInicio: true,
          rangeFinal: true,
        },
      });

      if (!edicao) {
        throw new NotFoundException('Edição não encontrada');
      }

      where.numero = {
        gte: edicao.rangeInicio,
        lte: edicao.rangeFinal,
      };
    }

    return where;
  }

  private serializarRange(item: {
    id: string;
    numero: bigint;
    sequenciaBolas: number[];
    disponivel: boolean;
  }) {
    return {
      ...item,
      numero: item.numero.toString(),
    };
  }
}
