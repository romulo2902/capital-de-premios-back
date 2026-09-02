import { Module, forwardRef } from '@nestjs/common';
import { VendasSenaService } from './vendas-sena.service';
import { VendasSenaController } from './vendas-sena.controller';
import { VendasSenaLojaController } from './vendas-sena-loja.controller';
import { PagamentosModule } from '../../pagamentos/pagamentos.module';
import { MaquininhasModule } from '../../maquininhas/maquininhas.module';

@Module({
  // MaquininhasModule sem forwardRef: ele só depende do PrismaModule.
  imports: [forwardRef(() => PagamentosModule), MaquininhasModule],
  controllers: [VendasSenaController, VendasSenaLojaController],
  providers: [VendasSenaService],
  exports: [VendasSenaService],
})
export class VendasSenaModule {}
