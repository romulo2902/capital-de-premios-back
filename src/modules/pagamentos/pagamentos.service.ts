import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando pagamento');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Pagamentos listados com sucesso',
      emptyMessage: 'Nenhum pagamento encontrado',
    });
  }

  findOne(id: string) {
    void id;
    throw new NotFoundException('Pagamentos não encontrado');
  }
}
