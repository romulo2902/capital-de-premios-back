import { Injectable } from '@nestjs/common';
import { TipoPagamento } from '@prisma/client';
import { PagBankPixGateway } from './pagbank-pix.gateway';
import { PagBankCartaoGateway } from './pagbank-cartao.gateway';
import { MercadoPagoPixGateway } from './mercadopago-pix.gateway';
import { AgilizePayPixGateway } from './agilizepay-pix.gateway';
import { FsPayPixGateway } from './fspay-pix.gateway';
import { MockPixGateway } from './mock-pix.gateway';
import { ConfigService } from '@nestjs/config';
import type { PaymentGateway } from './payment-gateway.interface';

/**
 * Factory que resolve a implementação correta do PaymentGateway
 * com base no TipoPagamento informado.
 *
 * O provedor de PIX é selecionado via env `PIX_GATEWAY_PROVIDER`
 * (FSPAY | AGILIZEPAY | PAGBANK | MERCADOPAGO, default FSPAY).
 */
@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly pagBankPixGateway: PagBankPixGateway,
    private readonly mercadoPagoPixGateway: MercadoPagoPixGateway,
    private readonly agilizePayPixGateway: AgilizePayPixGateway,
    private readonly fsPayPixGateway: FsPayPixGateway,
    private readonly mockPixGateway: MockPixGateway,
    private readonly pagBankCartaoGateway: PagBankCartaoGateway,
  ) {}

  /**
   * Resolve o gateway para criar uma NOVA cobrança, usando o provedor
   * configurado atualmente via env.
   */
  getGateway(tipo: TipoPagamento): PaymentGateway {
    const useMock = this.config.get<string>('MOCK_PIX_AUTO_APPROVE') === 'true';

    switch (tipo) {
      case TipoPagamento.PIX:
        return useMock ? this.mockPixGateway : this.resolverProvedorPix();
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

  /**
   * Resolve o gateway para CONSULTAR/CANCELAR uma cobrança já existente.
   *
   * Não usa apenas a env atual: se `PIX_GATEWAY_PROVIDER` mudar enquanto
   * houver cobranças pendentes criadas pelo provedor anterior, consultar
   * pelo provedor "atual" enviaria o gatewayId para a API errada. Por isso
   * inspeciona o `gatewayPayload` salvo na criação para identificar o
   * provedor real que originou a cobrança.
   */
  getGatewayParaConsulta(
    tipo: TipoPagamento,
    gatewayPayload?: unknown,
  ): PaymentGateway {
    if (tipo === TipoPagamento.PIX) {
      if (this.temChavePayload(gatewayPayload, 'mercadoPagoResponse')) {
        return this.mercadoPagoPixGateway;
      }

      if (this.temChavePayload(gatewayPayload, 'pagbankResponse')) {
        return this.pagBankPixGateway;
      }

      if (this.temChavePayload(gatewayPayload, 'agilizepayResponse')) {
        return this.agilizePayPixGateway;
      }

      if (this.temChavePayload(gatewayPayload, 'fspayResponse')) {
        return this.fsPayPixGateway;
      }
    }

    return this.getGateway(tipo);
  }

  private temChavePayload(gatewayPayload: unknown, chave: string): boolean {
    return (
      typeof gatewayPayload === 'object' &&
      gatewayPayload !== null &&
      chave in gatewayPayload
    );
  }

  private resolverProvedorPix(): PaymentGateway {
    const provedor = this.config
      .get<string>('PIX_GATEWAY_PROVIDER', 'FSPAY')
      .trim()
      .toUpperCase();

    switch (provedor) {
      case 'PAGBANK':
        return this.pagBankPixGateway;
      case 'MERCADOPAGO':
        return this.mercadoPagoPixGateway;
      case 'AGILIZEPAY':
        return this.agilizePayPixGateway;
      case 'FSPAY':
      default:
        return this.fsPayPixGateway;
    }
  }
}
