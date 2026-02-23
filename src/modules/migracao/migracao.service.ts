import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MigracaoService {
  private readonly logger = new Logger(MigracaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando migracao');
    return { message: 'migracao listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await null;// Migracao module stub;
    if (!item) throw new NotFoundException('Migracao não encontrado');
    return { message: 'Migracao encontrado', data: item };
  }
}
