import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EdicoesService {
  private readonly logger = new Logger(EdicoesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando edicao');
    return { message: 'edicao listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.edicao.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Edicoes não encontrado');
    return { message: 'Edicoes encontrado', data: item };
  }
}
