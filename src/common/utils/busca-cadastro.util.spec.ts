import { buildBuscaPorTexto } from './busca-cadastro.util';

describe('buildBuscaPorTexto', () => {
  const clausulasDeCpf = (search: string) =>
    buildBuscaPorTexto(search)
      .filter((c) => 'cpf' in c)
      .map((c) => (c.cpf as { contains: string }).contains);

  it('acha cadastro em dígitos quando o termo vem mascarado', () => {
    // O caso que motivou a correção: cadastro gravado como 05408934128.
    expect(clausulasDeCpf('054.089.341-28')).toContain('05408934128');
  });

  it('mantém o termo cru, para cadastro antigo gravado mascarado', () => {
    expect(clausulasDeCpf('054.089.341-28')).toContain('054.089.341-28');
  });

  it('não duplica a cláusula quando o termo já são só dígitos', () => {
    expect(clausulasDeCpf('05408934128')).toEqual(['05408934128']);
  });

  it('aceita CPF parcial, sem exigir os 11 dígitos', () => {
    expect(clausulasDeCpf('054089')).toEqual(['054089']);
  });

  it('busca por nome não gera cláusula de dígitos vazia', () => {
    // 'Amanda' normaliza para string vazia — um contains:'' casaria com tudo.
    expect(clausulasDeCpf('Amanda')).toEqual(['Amanda']);
  });

  it('procura em nome, cpf e email', () => {
    const chaves = buildBuscaPorTexto('Amanda').map((c) => Object.keys(c)[0]);
    expect(chaves).toEqual(['nome', 'cpf', 'email']);
  });
});
