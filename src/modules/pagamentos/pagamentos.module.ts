import { Module, forwardRef } from '@nestjs/common';
import { PagamentosController } from './pagamentos.controller';
import { PagamentosService } from './pagamentos.service';
import { PagBankPixGateway } from './gateways/pagbank-pix.gateway';
import { PagBankCartaoGateway } from './gateways/pagbank-cartao.gateway';
import { MercadoPagoPixGateway } from './gateways/mercadopago-pix.gateway';
import { AgilizePayPixGateway } from './gateways/agilizepay-pix.gateway';
import { FsPayPixGateway } from './gateways/fspay-pix.gateway';
import { PaymentGatewayFactory } from './gateways/payment-gateway.factory';
import { MockPixGateway } from './gateways/mock-pix.gateway';
import { VendasModule } from '../vendas/vendas.module';
import { VendasSenaModule } from '../capital-sena/vendas-sena/vendas-sena.module';

@Module({
  imports: [
    forwardRef(() => VendasModule),
    forwardRef(() => VendasSenaModule),
  ],
  controllers: [PagamentosController],
  providers: [
    PagamentosService,
    PagBankPixGateway,
    MercadoPagoPixGateway,
    AgilizePayPixGateway,
    FsPayPixGateway,
    MockPixGateway,
    PagBankCartaoGateway,
    PaymentGatewayFactory,
  ],
  exports: [PagamentosService, PaymentGatewayFactory],
})
export class PagamentosModule {}
