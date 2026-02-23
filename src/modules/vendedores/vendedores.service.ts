import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class VendedoresService {
  private readonly logger = new Logger(VendedoresService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando vendedor');
    return { message: 'vendedor listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.vendedor.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Vendedores não encontrado');
    return { message: 'Vendedores encontrado', data: item };
  }
}
