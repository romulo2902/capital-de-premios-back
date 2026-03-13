import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ComissoesService {
  private readonly logger = new Logger(ComissoesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    this.logger.log('Listando comissao');
    return { message: 'comissao listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.comissao.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Comissoes não encontrado');
    return { message: 'Comissoes encontrado', data: item };
  }
}
