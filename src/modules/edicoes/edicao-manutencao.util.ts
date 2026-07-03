import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';

const MENSAGEM_PADRAO_MANUTENCAO =
  'Vendas temporariamente indisponiveis para esta edicao.';

export interface EdicaoManutencaoState {
  manutencaoAtiva: boolean;
  manutencaoMensagem: string | null;
}

export interface EdicaoManutencaoContext extends EdicaoManutencaoState {
  id: string;
  numero: string;
}

export function serializarEstadoManutencao(
  edicao: EdicaoManutencaoState,
): {
  manutencaoAtiva: boolean;
  manutencaoMensagem: string | null;
  vendasBloqueadas: boolean;
} {
  const manutencaoAtiva = Boolean(edicao.manutencaoAtiva);

  return {
    manutencaoAtiva,
    manutencaoMensagem: normalizarMensagemManutencao(edicao.manutencaoMensagem),
    vendasBloqueadas: manutencaoAtiva,
  };
}

export function obterMensagemBloqueioVendas(edicao: EdicaoManutencaoState): string {
  return (
    normalizarMensagemManutencao(edicao.manutencaoMensagem) ??
    MENSAGEM_PADRAO_MANUTENCAO
  );
}

export function criarExcecaoEdicaoEmManutencao(
  edicao: EdicaoManutencaoContext,
): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: obterMensagemBloqueioVendas(edicao),
    data: {
      edicaoId: edicao.id,
      edicaoNumero: edicao.numero,
      ...serializarEstadoManutencao(edicao),
    },
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
  });
}

function normalizarMensagemManutencao(message?: string | null): string | null {
  const normalizedMessage = message?.trim();
  return normalizedMessage ? normalizedMessage : null;
}
