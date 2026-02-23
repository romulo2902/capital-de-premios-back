import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VendasService {
  private readonly logger = new Logger(VendasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando venda');
    return { message: 'venda listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.venda.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Vendas não encontrado');
    return { message: 'Vendas encontrado', data: item };
  }
}
