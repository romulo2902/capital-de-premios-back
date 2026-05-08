import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import type {
  PaymentGateway,
  CriarCobrancaInput,
  CriarCobrancaOutput,
  ConsultarCobrancaOutput,
} from './payment-gateway.interface';

@Injectable()
export class MockPixGateway implements PaymentGateway {
  private readonly logger = new Logger(MockPixGateway.name);

  constructor(private readonly config: ConfigService) {}

  async criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    const mockId = `mock_pix_${uuidv4()}`;

    this.logger.warn(`Criando cobrança MOCK: vendaId=${input.vendaId} valor=${input.valorCentavos}¢. Ela será aprovada automaticamente em 5 segundos.`);

    // Simular o webhook de aprovação do PagBank chamando a própria rota local após 5s
    setTimeout(() => {
      const port = this.config.get<string>('PORT', '3000');
      const webhookPayload = {
        event: 'CHARGE.PAID',
        charges: [
          {
            id: mockId,
            status: 'PAID',
            amount: { value: input.valorCentavos },
          },
        ],
      };

      fetch(`http://127.0.0.1:${port}/pagamentos/webhook/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      }).catch((err) =>
        this.logger.error(
          `Erro ao simular webhook local do mock: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, 5000);

    return {
      gatewayId: mockId,
      pixCopiaECola: '00020126580014br.gov.bcb.pix0136mock-pix-payload-aqui-5204000053039865802BR5909MOCK PIX6009SAO PAULO62070503***6304MOCK',
      qrCodeBase64: 'https://via.placeholder.com/200x200.png?text=MOCK+PIX',
      payload: { mock: true, warning: 'This is a mock gateway' },
    };
  }

  async consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput> {
    this.logger.warn(`Consultando cobrança MOCK: ${gatewayId}`);
    return {
      status: 'APROVADO',
      paidAt: new Date(),
      payload: { mock: true, status: 'PAID' },
    };
  }

  async cancelarCobranca(gatewayId: string): Promise<void> {
    this.logger.warn(`Cobrança MOCK cancelada: ${gatewayId}`);
  }
}
