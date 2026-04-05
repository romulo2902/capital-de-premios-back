import { Module, forwardRef } from '@nestjs/common';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';
import { InterPixGateway } from './gateways/inter-pix.gateway';
import { CartaoCreditGateway } from './gateways/cartao-credit.gateway';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { VendasModule } from '../vendas/vendas.module';

@Module({
  imports: [forwardRef(() => VendasModule)],
  controllers: [PagamentosController],
  providers: [
    PagamentosService,
    InterPixGateway,
    CartaoCreditGateway,
    PaymentGatewayFactory,
  ],
  exports: [PagamentosService, PaymentGatewayFactory],
})
export class PagamentosModule {}
