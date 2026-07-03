export type PaymentErrorCode =
  | 'PAGBANK_INVALID_TAX_ID'
  | 'PAGBANK_INVALID_CREDENTIAL'
  | 'PAGBANK_NOTIFICATION_NOT_CONFIGURED'
  | 'PAGBANK_NOTIFICATION_LOOKUP_FAILED'
  | 'PAGBANK_UNAVAILABLE';

export function mapearErroPagamento(errorMessage: string): {
  errorCode: PaymentErrorCode;
  userMessage: string;
} {
  if (
    errorMessage.includes('customer.tax_id') ||
    errorMessage.includes('must be a valid CPF or CNPJ')
  ) {
    return {
      errorCode: 'PAGBANK_INVALID_TAX_ID',
      userMessage:
        'O CPF informado é inválido. Revise os dados e tente novamente.',
    };
  }

  if (
    errorMessage.includes('UNAUTHORIZED') ||
    errorMessage.includes('Invalid credential')
  ) {
    return {
      errorCode: 'PAGBANK_INVALID_CREDENTIAL',
      userMessage:
        'Não conseguimos gerar o PIX agora. Tente novamente em alguns instantes.',
    };
  }

  return {
    errorCode: 'PAGBANK_UNAVAILABLE',
    userMessage:
      'Não conseguimos gerar o PIX agora. Tente novamente em alguns instantes.',
  };
}
