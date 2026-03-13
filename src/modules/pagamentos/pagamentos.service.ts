import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    this.logger.log('Listando pagamento');
    return { message: 'pagamento listados com sucesso', data: [] };
  }

  findOne(id: string) {
    void id;
    throw new NotFoundException('Pagamentos não encontrado');
  }
}
