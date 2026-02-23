import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientesService {
  private readonly logger = new Logger(ClientesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando cliente');
    return { message: 'cliente listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.cliente.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Clientes não encontrado');
    return { message: 'Clientes encontrado', data: item };
  }
}
