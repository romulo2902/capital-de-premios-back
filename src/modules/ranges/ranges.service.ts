import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class RangesService {
  private readonly logger = new Logger(RangesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando range');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Ranges listados com sucesso',
      emptyMessage: 'Nenhum range encontrado',
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.range.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Ranges não encontrado');
    return { message: 'Ranges encontrado', data: item };
  }
}
