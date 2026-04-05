import { Injectable } from '@nestjs/common';
import { TipoPagamento } from '@prisma/client';
import { InterPixGateway } from './inter-pix.gateway';
import { CartaoCreditGateway } from './cartao-credit.gateway';
import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Factory que resolve a implementação correta do PaymentGateway
 * com base no TipoPagamento informado.
 */
@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly interPixGateway: InterPixGateway,
    private readonly cartaoCreditGateway: CartaoCreditGateway,
  ) {}

  getGateway(tipo: TipoPagamento): PaymentGateway {
    switch (tipo) {
      case TipoPagamento.PIX:
        return this.interPixGateway;
      case TipoPagamento.CARTAO:
        return this.cartaoCreditGateway;
      default: {
        const _exhaustive: never = tipo;
        throw new Error(`Tipo de pagamento desconhecido: ${String(_exhaustive)}`);
      }
    }
  }
}
