import { InternalServerErrorException } from '@nestjs/common';

/**
 * Vínculo comercial de um Cliente: o vendedor que o atendeu e o distribuidor
 * ao qual esse vendedor pertence.
 *
 * Três estados são válidos:
 *   - `{ vendedorId: null, distribuidorId: null }` — cliente órfão (loja pública
 *     sem `seller_id`, ou importação em massa)
 *   - `{ vendedorId: null, distribuidorId: D }`   — captado direto pelo link do
 *     distribuidor
 *   - `{ vendedorId: V, distribuidorId: D }`      — captado por um vendedor
 *
 * O estado `{ vendedorId: V, distribuidorId: null }` é incoerente: todo Vendedor
 * pertence obrigatoriamente a um Distribuidor (FK NOT NULL no schema).
 */
export interface VinculoCliente {
  vendedorId: string | null;
  distribuidorId: string | null;
}

export interface EntradaVinculoCliente {
  vendedorId: string | null | undefined;
  distribuidorId: string | null | undefined;
  /**
   * `distribuidorId` do vendedor informado, já lido do banco pelo chamador.
   * Mantém este helper puro — sem Prisma, sem I/O.
   */
  distribuidorDoVendedor?: string | null;
}

/**
 * Decide o vínculo final de um cliente a partir do que foi informado.
 *
 * Regra: **o valor explícito vence**. Um `distribuidorId` informado é sempre
 * respeitado, mesmo quando difere do distribuidor do vendedor — a derivação
 * serve apenas para preencher o campo quando ele chega vazio.
 *
 * A coerência entre vendedor e distribuidor é responsabilidade de quem chama:
 * os controllers só permitem informar `distribuidorId` explicitamente para
 * ADMIN; para VENDEDOR e DISTRIBUIDOR o vínculo vem do token.
 *
 * Retorna `null` quando nada foi informado. Cabe ao chamador decidir o que isso
 * significa no seu contexto: preservar o vínculo atual (atualização) ou gravar
 * um cliente órfão (criação).
 */
export function resolverVinculoCliente({
  vendedorId,
  distribuidorId,
  distribuidorDoVendedor,
}: EntradaVinculoCliente): VinculoCliente | null {
  const vendedor = normalizarId(vendedorId);
  const distribuidor = normalizarId(distribuidorId);

  if (vendedor) {
    const distribuidorFinal =
      distribuidor ?? normalizarId(distribuidorDoVendedor);

    if (!distribuidorFinal) {
      // Só acontece se o vendedor não existir ou se a FK NOT NULL for violada.
      // Devolver `{ vendedor, null }` gravaria o estado incoerente que a CHECK
      // constraint recusa — melhor falhar aqui, com contexto.
      throw new InternalServerErrorException(
        'Vendedor sem distribuidor vinculado',
      );
    }

    return { vendedorId: vendedor, distribuidorId: distribuidorFinal };
  }

  if (distribuidor) {
    return { vendedorId: null, distribuidorId: distribuidor };
  }

  return null;
}

/** Trata string vazia como ausência de valor. */
function normalizarId(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalizado = value.trim();
  return normalizado === '' ? null : normalizado;
}
