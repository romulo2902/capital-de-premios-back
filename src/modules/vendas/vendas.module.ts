import { Module, forwardRef } from '@nestjs/common';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';
import { VendasPosReconciliacaoService } from './vendas-pos-reconciliacao.service';
import { PagamentosModule } from '../pagamentos/pagamentos.module';
import { ConfiguracaoComissaoModule } from '../configuracao-comissao/configuracao-comissao.module';

@Module({
  imports: [
    forwardRef(() => PagamentosModule),
    ConfiguracaoComissaoModule,
  ],
  controllers: [VendasController],
  providers: [VendasService, VendasPosReconciliacaoService],
  exports: [VendasService],
})
export class VendasModule {}
