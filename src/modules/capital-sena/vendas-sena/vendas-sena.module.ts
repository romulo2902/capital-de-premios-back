import { Module, forwardRef } from '@nestjs/common';
import { VendasSenaService } from './vendas-sena.service';
import { VendasSenaController } from './vendas-sena.controller';
import { VendasSenaLojaController } from './vendas-sena-loja.controller';
import { PagamentosModule } from '../../pagamentos/pagamentos.module';

@Module({
  imports: [forwardRef(() => PagamentosModule)],
  controllers: [VendasSenaController, VendasSenaLojaController],
  providers: [VendasSenaService],
  exports: [VendasSenaService],
})
export class VendasSenaModule {}
