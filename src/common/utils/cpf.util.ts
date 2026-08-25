/**
 * Normalização de CPF.
 *
 * O CPF é a chave natural do Cliente (`@unique` no schema), mas os DTOs aceitam
 * as duas formas — `03112345675` e `031.123.456-75`. Gravar o que chegou fazia
 * o mesmo cliente existir em dois formatos: a busca por CPF do POS e do painel,
 * que compara só dígitos, não achava o cadastro mascarado, e a `@unique` não
 * impedia o duplicado, porque para o banco são strings diferentes.
 *
 * Regra: **grava-se sempre só dígitos**. A leitura aceita os dois formatos
 * enquanto houver cadastro antigo mascarado na base.
 */

/** Só os dígitos do CPF. */
export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/** CPF na forma mascarada. Devolve a entrada intacta se não tiver 11 dígitos. */
export function formatarCpf(cpf: string): string {
  const digitos = normalizarCpf(cpf);

  if (digitos.length !== 11) {
    return cpf;
  }

  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
}

/**
 * As formas em que o mesmo CPF pode estar gravado, para uso em
 * `where: { cpf: { in: variacoesDeCpf(cpf) } }`.
 *
 * Sem duplicatas: um CPF com tamanho inesperado (entrada parcial de busca)
 * volta como uma única variação, em vez de repetir a mesma string.
 */
export function variacoesDeCpf(cpf: string): string[] {
  const digitos = normalizarCpf(cpf);
  const mascarado = formatarCpf(digitos);

  return digitos === mascarado ? [digitos] : [digitos, mascarado];
}
