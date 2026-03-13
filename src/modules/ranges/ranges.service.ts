import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RangesService {
  private readonly logger = new Logger(RangesService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    this.logger.log('Listando range');
    return { message: 'range listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await this.prisma.range.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Ranges não encontrado');
    return { message: 'Ranges encontrado', data: item };
  }
}
