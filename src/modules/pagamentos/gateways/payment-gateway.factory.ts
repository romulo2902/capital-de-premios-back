import { Injectable } from '@nestjs/common';
import { TipoPagamento } from '@prisma/client';
import { PagBankPixGateway } from './pagbank-pix.gateway';
import { PagBankCartaoGateway } from './pagbank-cartao.gateway';
import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Factory que resolve a implementação correta do PaymentGateway
 * com base no TipoPagamento informado.
 */
@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly pagBankPixGateway: PagBankPixGateway,
    private readonly pagBankCartaoGateway: PagBankCartaoGateway,
  ) {}

  getGateway(tipo: TipoPagamento): PaymentGateway {
    switch (tipo) {
      case TipoPagamento.PIX:
        return this.pagBankPixGateway;
      case TipoPagamento.CARTAO:
        return this.pagBankCartaoGateway;
      case TipoPagamento.MANUAL:
        throw new Error(
          'TipoPagamento.MANUAL não utiliza gateway de pagamento',
        );
      default: {
        const _exhaustive: never = tipo;
        throw new Error(`Tipo de pagamento desconhecido: ${String(_exhaustive)}`);
      }
    }
  }
}
