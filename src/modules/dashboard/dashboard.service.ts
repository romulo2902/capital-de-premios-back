import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    this.logger.log('Listando dashboard');
    return { message: 'dashboard listados com sucesso', data: [] };
  }

  findOne(id: string) {
    void id;
    throw new NotFoundException('Dashboard não encontrado');
  }
}
