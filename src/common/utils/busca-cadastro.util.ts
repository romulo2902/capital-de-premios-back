import { normalizarCpf } from './cpf.util';

/**
 * Cláusulas de busca por texto livre para cadastros com nome, CPF e e-mail.
 *
 * O CPF é gravado só com dígitos (ver `cpf.util.ts`), mas o usuário digita a
 * forma que estiver na frente dele — copiada de um documento, ela vem
 * mascarada. Comparar o texto cru contra a coluna fazia `054.089.341-28` não
 * achar o cadastro gravado como `05408934128`.
 *
 * Daí as duas cláusulas de CPF: a crua cobre o termo em dígitos e os cadastros
 * antigos que ficaram mascarados na base; a de dígitos cobre o termo mascarado
 * contra o cadastro normalizado. `contains` em vez de igualdade porque a busca
 * também aceita CPF parcial.
 */
export function buildBuscaPorTexto(
  search: string,
): { nome?: object; cpf?: object; email?: object }[] {
  const termo = search.trim();
  const digitos = normalizarCpf(termo);

  return [
    { nome: { contains: termo, mode: 'insensitive' as const } },
    { cpf: { contains: termo } },
    ...(digitos && digitos !== termo ? [{ cpf: { contains: digitos } }] : []),
    { email: { contains: termo, mode: 'insensitive' as const } },
  ];
}
