import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BilhetesService {
  private readonly logger = new Logger(BilhetesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando bilhete');
    return { message: 'bilhete listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.bilhete.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Bilhetes não encontrado');
    return { message: 'Bilhetes encontrado', data: item };
  }
}
