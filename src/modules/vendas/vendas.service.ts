import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class VendasService {
  private readonly logger = new Logger(VendasService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando venda');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Vendas listadas com sucesso',
      emptyMessage: 'Nenhuma venda encontrada',
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.venda.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Vendas não encontrado');
    return { message: 'Vendas encontrado', data: item };
  }
}
