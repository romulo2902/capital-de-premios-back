import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando dashboard');
    return { message: 'dashboard listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await [];// Dashboard uses aggregated queries;
    if (!item) throw new NotFoundException('Dashboard não encontrado');
    return { message: 'Dashboard encontrado', data: item };
  }
}
