import { Prisma } from '@prisma/client';

/**
 * Include padrão para queries de Venda.
 * Traz relações essenciais em todas as consultas.
 */
export const VENDA_INCLUDE = {
  cliente: {
    select: {
      id: true,
      codigo: true,
      cpf: true,
      nome: true,
      telefone: true,
      email: true,
    },
  },
  edicao: {
    select: {
      id: true,
      numero: true,
      dataSorteio: true,
      valorCartela: true,
      status: true,
      imagemUrl: true,
    },
  },
  vendedor: {
    select: {
      id: true,
      codigo: true,
      nome: true,
      comissaoPercent: true,
    },
  },
  comissao: {
    select: {
      id: true,
      valor: true,
      status: true,
    },
  },
  _count: {
    select: {
      bilhetes: true,
    },
  },
} satisfies Prisma.VendaInclude;

/**
 * Include completo para detalhes individuais (inclui bilhetes).
 */
export const VENDA_INCLUDE_DETALHES = {
  ...VENDA_INCLUDE,
  bilhetes: {
    select: {
      id: true,
      numero: true,
      sequenciaBolas: true,
      ganhador: true,
      premioId: true,
    },
    orderBy: { numero: 'asc' as const },
  },
} satisfies Prisma.VendaInclude;

/** Tempo de expiração padrão do PIX em segundos (30 minutos) */
export const PIX_EXPIRACAO_SEGUNDOS = 1800;
