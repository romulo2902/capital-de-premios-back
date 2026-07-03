import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class ComissoesService {
  private readonly logger = new Logger(ComissoesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando comissao');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Comissões listadas com sucesso',
      emptyMessage: 'Nenhuma comissão encontrada',
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.comissao.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Comissoes não encontrado');
    return { message: 'Comissoes encontrado', data: item };
  }
}
