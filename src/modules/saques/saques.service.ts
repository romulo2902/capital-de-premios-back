import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SaquesService {
  private readonly logger = new Logger(SaquesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando saque');
    return { message: 'saque listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.saque.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Saques não encontrado');
    return { message: 'Saques encontrado', data: item };
  }
}
