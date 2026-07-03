import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filtros: FiltroAuditoriaDto = {}) {
    const pagination = normalizePagination(filtros.page ?? 1, filtros.limit ?? 20);
    const where: Record<string, unknown> = {};

    if (filtros.model) {
      where.model = filtros.model;
    }

    if (filtros.action) {
      where.action = filtros.action;
    }

    if (filtros.actorId) {
      where.actorId = filtros.actorId;
    }

    if (filtros.requestId) {
      where.requestId = filtros.requestId;
    }

    const auditLog = (this.prisma as unknown as {
      auditLog: {
        findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
        count: (args: Record<string, unknown>) => Promise<number>;
        findUnique: (args: Record<string, unknown>) => Promise<unknown | null>;
      };
    }).auditLog;

    const [data, total] = await Promise.all([
      auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      auditLog.count({ where }),
    ]);

    return buildPaginatedResponse(
      data,
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Logs de auditoria listados com sucesso',
        emptyMessage: 'Nenhum log de auditoria encontrado',
      },
    );
  }

  async findOne(id: string) {
    const auditLog = (this.prisma as unknown as {
      auditLog: {
        findUnique: (args: Record<string, unknown>) => Promise<unknown | null>;
      };
    }).auditLog;

    const item = await auditLog.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException('Log de auditoria não encontrado');
    }

    return {
      message: 'Log de auditoria encontrado com sucesso',
      data: item,
    };
  }
}
