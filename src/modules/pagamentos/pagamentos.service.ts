import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    this.logger.log('Listando pagamento');
    return { message: 'pagamento listados com sucesso', data: [] };
  }

  async findOne(id: string) {
    const item = await null;// Pagamento module stub;
    if (!item) throw new NotFoundException('Pagamentos não encontrado');
    return { message: 'Pagamentos encontrado', data: item };
  }
}
