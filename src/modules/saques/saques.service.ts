import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class SaquesService {
  private readonly logger = new Logger(SaquesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando saque');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Saques listados com sucesso',
      emptyMessage: 'Nenhum saque encontrado',
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.saque.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Saques não encontrado');
    return { message: 'Saques encontrado', data: item };
  }
}
