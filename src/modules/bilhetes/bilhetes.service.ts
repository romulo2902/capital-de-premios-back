import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class BilhetesService {
  private readonly logger = new Logger(BilhetesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando bilhete');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Bilhetes listados com sucesso',
      emptyMessage: 'Nenhum bilhete encontrado',
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.bilhete.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Bilhetes não encontrado');
    return { message: 'Bilhetes encontrado', data: item };
  }
}
