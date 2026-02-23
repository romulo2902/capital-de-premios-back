import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DistribuidoresService {
  private readonly logger = new Logger(DistribuidoresService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando distribuidor');
    return { message: 'distribuidor listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.distribuidor.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Distribuidores não encontrado');
    return { message: 'Distribuidores encontrado', data: item };
  }
}
