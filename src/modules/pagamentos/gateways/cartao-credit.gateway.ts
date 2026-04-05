import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import type {
  PaymentGateway,
  CriarCobrancaInput,
  CriarCobrancaOutput,
  ConsultarCobrancaOutput,
} from './payment-gateway.interface';

/**
 * Gateway stub para Cartão de Crédito.
 *
 * Implementa a interface PaymentGateway para manter a arquitetura
 * extensível. Quando o provedor de cartão for definido, basta
 * implementar os métodos aqui.
 */
@Injectable()
export class CartaoCreditGateway implements PaymentGateway {
  private readonly logger = new Logger(CartaoCreditGateway.name);

  async criarCobranca(_input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    this.logger.warn('Gateway de cartão de crédito ainda não implementado');
    throw new NotImplementedException(
      'O pagamento por cartão de crédito ainda não está disponível. Use PIX.',
    );
  }

  async consultarCobranca(_gatewayId: string): Promise<ConsultarCobrancaOutput> {
    throw new NotImplementedException(
      'Consulta de cobrança por cartão de crédito não implementada.',
    );
  }

  async cancelarCobranca(_gatewayId: string): Promise<void> {
    throw new NotImplementedException(
      'Cancelamento de cobrança por cartão de crédito não implementado.',
    );
  }
}
