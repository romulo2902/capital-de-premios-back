import { Module, forwardRef } from '@nestjs/common';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';
import { PagBankPixGateway } from './gateways/pagbank-pix.gateway';
import { PagBankCartaoGateway } from './gateways/pagbank-cartao.gateway';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { VendasModule } from '../vendas/vendas.module';

@Module({
  imports: [forwardRef(() => VendasModule)],
  controllers: [PagamentosController],
  providers: [
    PagamentosService,
    PagBankPixGateway,
    PagBankCartaoGateway,
    PaymentGatewayFactory,
  ],
  exports: [PagamentosService, PaymentGatewayFactory],
})
export class PagamentosModule {}
