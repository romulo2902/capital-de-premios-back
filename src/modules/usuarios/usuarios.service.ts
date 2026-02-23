import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger(UsuariosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando usuario');
    return { message: 'usuario listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.usuario.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Usuarios não encontrado');
    return { message: 'Usuarios encontrado', data: item };
  }
}
