import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
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
 * Interno: quem precisa distinguir "campo não veio" (`undefined`) de "campo
 * veio vazio" (`null`) usa `normalizarIdPreservandoAusencia`, que é exportada.
 */
function normalizarId(value: string | null | undefined): string | null {
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
 * mecanismo da loja pública e não tem por que viajar numa requisição
 * autenticada, onde o vínculo já vem do token. Hoje o service o ignoraria de
 * qualquer forma (só usa o `seller_id` quando nenhum vínculo explícito veio),
 * mas descartá-lo aqui mantém a regra num lugar só.
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

/** Estado do cadastro mais o que chegou no payload de atualização. */
export interface EntradaVinculoAtualizacao {
  /** `undefined` = campo ausente no payload; `null` = presente e vazio. */
  vendedorInformado: string | null | undefined;
  distribuidorInformado: string | null | undefined;
  vendedorAtual: string | null;
  distribuidorAtual: string | null;
  /**
   * `distribuidorId` do vendedor final (o que vale ao término da atualização
   * — ver `vendedorFinalDaAtualizacao`), já lido do banco pelo chamador.
   *
   * Obrigatório mesmo quando não há vendedor final (nesse caso, `null`):
   * torna impossível esquecer o campo e ele acabar como `undefined`, que esta
   * função não sabe distinguir de "o vendedor é de outra rede" — a omissão
   * silenciosa desvincularia o vendedor num PATCH que não pediu isso.
   */
  distribuidorDoVendedor: string | null;
}

/**
 * Qual vendedor vale ao final da atualização: o que veio no payload, ou o que
 * já estava no cadastro quando o campo não foi informado.
 *
 * Exposta porque o chamador precisa dela ANTES de decidir o vínculo — é por
 * este id que ele carrega o vendedor para obter `distribuidorDoVendedor`.
 */
export function vendedorFinalDaAtualizacao(
  vendedorInformado: string | null | undefined,
  vendedorAtual: string | null,
): string | null {
  return vendedorInformado !== undefined
    ? normalizarId(vendedorInformado)
    : vendedorAtual;
}

/**
 * Decide o vínculo de uma ATUALIZAÇÃO de cliente.
 *
 * Regra única: só conta como explícito o que chegou nesta requisição. O que
 * vem do cadastro é contexto, não escolha do chamador — e é isso que separa
 * "mover o cliente de rede" de "reafirmar a rede atual".
 *
 * Casos:
 *   - vendedor informado  → ele vence, e o distribuidor sai dele quando não
 *     for informado (a regra do valor explícito).
 *   - só distribuidor informado, mudando de rede → o vendedor do cadastro não
 *     foi escolhido nesta requisição e é ele que cede.
 *   - só distribuidor informado, igual ao atual → nada muda; ceder aqui
 *     apagaria o vendedor num PATCH que não alterou coisa alguma.
 *   - distribuidor informado como vazio, com vendedor no cliente → recusa. Um
 *     vendedor implica seu distribuidor (CHECK no banco), então honrar o
 *     pedido exigiria apagar o `vendedorId`, que o chamador não mencionou.
 */
export function resolverVinculoClienteNaAtualizacao({
  vendedorInformado,
  distribuidorInformado,
  vendedorAtual,
  distribuidorAtual,
  distribuidorDoVendedor,
}: EntradaVinculoAtualizacao): VinculoCliente {
  const vendedorExplicito = vendedorInformado !== undefined;
  const distribuidorExplicito = distribuidorInformado !== undefined;

  const vendedorFinal = vendedorFinalDaAtualizacao(
    vendedorInformado,
    vendedorAtual,
  );
  const distribuidor = normalizarId(distribuidorInformado);
  const distribuidorDoVendedorNormalizado = normalizarId(
    distribuidorDoVendedor,
  );

  // Guarda de contrato: com vendedor final presente, `distribuidorDoVendedor`
  // não pode ser `null` — o TypeScript já obriga a passá-lo, isto cobre quem
  // contornar o tipo. Sem essa checagem, `vendedorCede` abaixo trataria "não
  // sei a rede dele" como "a rede é outra" e desvincularia o vendedor calado.
  if (vendedorFinal && !distribuidorDoVendedorNormalizado) {
    throw new InternalServerErrorException(
      'distribuidorDoVendedor não informado para um vendedor final presente',
    );
  }

  // Só recusa quando o vendedor NÃO foi mencionado nesta requisição: aí
  // honrar o pedido exigiria apagar um campo que o chamador não citou. Quando
  // os dois vêm juntos (`vendedorId: V, distribuidorId: ''`), o vazio é um
  // pedido de derivação, não de remoção.
  if (
    distribuidorExplicito &&
    !distribuidor &&
    !vendedorExplicito &&
    vendedorFinal
  ) {
    throw new BadRequestException(
      'Não é possível remover o distribuidor de um cliente que tem vendedor. ' +
        'Envie `vendedorId` vazio na mesma requisição para desvincular os dois.',
    );
  }

  // O vendedor do cadastro cede ao distribuidor explícito só quando a rede
  // está de fato mudando e ele é de outra rede.
  const vendedorCede =
    !vendedorExplicito &&
    distribuidorExplicito &&
    Boolean(distribuidor) &&
    distribuidor !== distribuidorAtual &&
    Boolean(vendedorFinal) &&
    distribuidorDoVendedorNormalizado !== distribuidor;

  const vinculo = resolverVinculoCliente({
    vendedorId: vendedorCede ? null : vendedorFinal,
    // Distribuidor não informado: deriva do vendedor quando há um; sem
    // vendedor não há de onde derivar, então preserva-se o do cadastro.
    distribuidorId: distribuidorExplicito
      ? distribuidor
      : vendedorFinal
        ? null
        : distribuidorAtual,
    distribuidorDoVendedor,
  });

  return vinculo ?? { vendedorId: null, distribuidorId: null };
}

/**
 * Recusa um vendedor que não pertence à rede do distribuidor autenticado.
 *
 * Só age para o perfil DISTRIBUIDOR: ADMIN informa o vínculo livremente e
 * VENDEDOR já tem o seu forçado pelo token.
 */
export function garantirVendedorDaRedeDoDistribuidor(
  vendedor: { distribuidorId: string } | null | undefined,
  user: UsuarioDoVinculo | undefined,
): void {
  if (!vendedor || user?.perfil !== 'DISTRIBUIDOR') {
    return;
  }

  if (vendedor.distribuidorId !== user.distribuidorId) {
    throw new ForbiddenException(
      'Vendedor não pertence ao distribuidor autenticado',
    );
  }
}

/** Vínculo parcial: `{}` significa "nada informado, preserve o atual". */
export type VinculoClienteParcial = Partial<VinculoCliente>;

/**
 * Decide o vínculo a gravar no cadastro do cliente durante uma compra.
 *
 * Recebe a leitura como callback em vez do Prisma: mantém o util sem
 * dependência de infra e deixa os dois produtos (Capital Prêmios e Capital
 * Sena) compartilharem a mesma regra, em vez de manterem cópias em lockstep.
 *
 * `distribuidorDoVendedorConhecido` evita a consulta quando o chamador já
 * carregou o vendedor — a validação continua valendo para quem não carregou.
 */
export async function resolverVinculoDaCompra(
  buscarDistribuidorDoVendedor: (vendedorId: string) => Promise<string | null>,
  vendedorId?: string,
  distribuidorId?: string,
  distribuidorDoVendedorConhecido?: string,
): Promise<VinculoClienteParcial> {
  let distribuidorDoVendedor: string | null =
    distribuidorDoVendedorConhecido ?? null;

  if (vendedorId && !distribuidorDoVendedor) {
    // Os `create` dos services validam o vendedor antes de chegar aqui, mas
    // este caminho também é alcançado por fluxos que não passam por aquela
    // validação (a loja pública, por exemplo). Sem o 404 o par
    // (vendedor, null) seria gravado e a CHECK do banco devolveria erro de
    // constraint no lugar de uma mensagem útil.
    distribuidorDoVendedor = await buscarDistribuidorDoVendedor(vendedorId);

    if (!distribuidorDoVendedor) {
      throw new NotFoundException('Vendedor não encontrado');
    }
  }

  // `null` = nada informado; aqui significa preservar o vínculo atual do
  // cliente, então devolvemos um objeto vazio.
  return (
    resolverVinculoCliente({
      vendedorId,
      distribuidorId,
      distribuidorDoVendedor,
    }) ?? {}
  );
}
