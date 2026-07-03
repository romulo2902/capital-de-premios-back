import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, limit = 20) {
    this.logger.log('Listando usuario');
    const pagination = normalizePagination(page, limit);

    return buildPaginatedResponse([], 0, pagination.page, pagination.limit, {
      successMessage: 'Usuários listados com sucesso',
      emptyMessage: 'Nenhum usuário encontrado',
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.usuario.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Usuarios não encontrado');
    return { message: 'Usuarios encontrado', data: item };
  }
}
