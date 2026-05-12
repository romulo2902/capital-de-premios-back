import { Module } from '@nestjs/common';
import { VendasSenaService } from './vendas-sena.service';
import { VendasSenaController } from './vendas-sena.controller';
import { VendasSenaLojaController } from './vendas-sena-loja.controller';
import { PagamentosModule } from '../../pagamentos/pagamentos.module';

@Module({
  imports: [PagamentosModule],
  controllers: [VendasSenaController, VendasSenaLojaController],
  providers: [VendasSenaService],
  exports: [VendasSenaService],
})
export class VendasSenaModule {}
