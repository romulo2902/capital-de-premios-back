import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando dashboard');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Dashboards listados com sucesso',
      emptyMessage: 'Nenhum dashboard encontrado',
    });
  }

  findOne(id: string) {
    void id;
    throw new NotFoundException('Dashboard não encontrado');
  }
}
