/**
 * Interface abstrata para gateways de pagamento.
 *
 * Toda integração com provedor de pagamento (PagBank PIX, PagBank Cartão, etc.)
 * deve implementar esta interface para ser plugável no sistema.
 */

export interface CriarCobrancaInput {
  /** ID interno da venda (usado como correlação/txid) */
  vendaId: string;

  /** Valor em centavos (inteiro) */
  valorCentavos: number;

  /** Descrição exibida na cobrança */
  descricao: string;

  /** CPF do pagador (somente números) */
  cpfPagador: string;

  /** Nome do pagador */
  nomePagador: string;

  /** Tempo de expiração em segundos (default: 1800 = 30 min) */
  expiracaoSegundos?: number;

  /**
   * Token do cartão gerado pelo SDK PagBank no frontend.
   * Obrigatório para TipoPagamento.CARTAO.
   */
  cardToken?: string;

  /**
   * Número de parcelas (default: 1).
   * Aplicável apenas a TipoPagamento.CARTAO.
   */
  installments?: number;
}

export interface CriarCobrancaOutput {
  /** Identificador externo no gateway (txid, id de transação, etc.) */
  gatewayId: string;

  /** Código copia-e-cola PIX (apenas para PIX) */
  pixCopiaECola?: string;

  /** QR Code em base64 (apenas para PIX) */
  qrCodeBase64?: string;

  /** URL de pagamento (para redirecionamento — cartão, boleto, etc.) */
  urlPagamento?: string;

  /** Payload bruto retornado pelo gateway */
  payload: Record<string, unknown>;
}

export type StatusCobrancaGateway =
  | 'PENDENTE'
  | 'APROVADO'
  | 'EXPIRADO'
  | 'CANCELADO';

export interface ConsultarCobrancaOutput {
  /** Status normalizado da cobrança */
  status: StatusCobrancaGateway;

  /** Data/hora do pagamento (se aprovado) */
  paidAt?: Date;

  /** Payload bruto retornado pelo gateway */
  payload: Record<string, unknown>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentGateway {
  /**
   * Cria uma nova cobrança no gateway.
   */
  criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput>;

  /**
   * Consulta o status de uma cobrança existente.
   */
  consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput>;

  /**
   * Cancela/remove uma cobrança existente.
   */
  cancelarCobranca(gatewayId: string): Promise<void>;
}
