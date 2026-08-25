import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';

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

/**
 * Trata string vazia como ausência de valor, colapsando para `null`.
 *
 * Use `normalizarIdPreservandoAusencia` quando for preciso distinguir "campo
 * não veio" (`undefined`) de "campo veio vazio" (`null`).
 */
export function normalizarId(value: string | null | undefined): string | null {
  return normalizarIdPreservandoAusencia(value) ?? null;
}

/**
 * Normaliza mantendo a diferença entre `undefined` (campo ausente no payload)
 * e `null` (campo presente e vazio) — distinção que os fluxos de atualização
 * usam para decidir entre preservar e sobrescrever.
 */
export function normalizarIdPreservandoAusencia(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  const normalizado = value.trim();
  return normalizado === '' ? null : normalizado;
}

/** Campos de vínculo comercial que um DTO de criação de venda pode trazer. */
export interface VinculoNoCorpo {
  vendedorId?: string;
  distribuidorId?: string;
  seller_id?: string;
}

/** Só o que o guard precisa saber do usuário autenticado. */
export interface UsuarioDoVinculo {
  perfil: string;
  vendedorId?: string;
  distribuidorId?: string;
}

/**
 * Aplica ao DTO o vínculo comercial derivado do token, descartando o que veio
 * no corpo. Esses campos definem para quem vai a comissão, então não podem ser
 * escolhidos pelo cliente da API — exceto por ADMIN, que informa livremente.
 *
 * `seller_id` também é descartado para VENDEDOR e DISTRIBUIDOR: ele é o
 * mecanismo da loja pública e, se aceito aqui, sobrescreveria o vínculo do
 * token no service.
 */
export function aplicarVinculoDoToken(
  dto: VinculoNoCorpo,
  user: UsuarioDoVinculo,
): void {
  if (user.perfil === 'VENDEDOR') {
    // Sem vínculo no token não há a quem creditar: recusar é mais seguro do
    // que cair fora do guard e deixar o corpo decidir.
    if (!user.vendedorId) {
      throw new ForbiddenException(
        'Usuário vendedor sem vínculo válido para criar venda',
      );
    }

    dto.vendedorId = user.vendedorId;
    delete dto.distribuidorId;
    delete dto.seller_id;
    return;
  }

  if (user.perfil === 'DISTRIBUIDOR') {
    if (!user.distribuidorId) {
      throw new ForbiddenException(
        'Usuário distribuidor sem vínculo válido para criar venda',
      );
    }

    dto.distribuidorId = user.distribuidorId;
    // `vendedorId` é preservado: o distribuidor pode lançar venda para um
    // vendedor da própria rede. A posse é validada no service.
    delete dto.seller_id;
    return;
  }

  // ADMIN: vínculo livre.
}
