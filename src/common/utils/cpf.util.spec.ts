import { formatarCpf, normalizarCpf, variacoesDeCpf } from './cpf.util';

describe('cpf.util', () => {
  it('normaliza removendo máscara', () => {
    expect(normalizarCpf('031.123.456-75')).toBe('03112345675');
    expect(normalizarCpf('03112345675')).toBe('03112345675');
  });

  it('formata a partir de qualquer forma', () => {
    expect(formatarCpf('03112345675')).toBe('031.123.456-75');
    expect(formatarCpf('031.123.456-75')).toBe('031.123.456-75');
  });

  it('devolve a entrada intacta quando não tem 11 dígitos', () => {
    expect(formatarCpf('123')).toBe('123');
  });

  it('cobre as duas formas gravadas para a busca', () => {
    expect(variacoesDeCpf('031.123.456-75')).toEqual([
      '03112345675',
      '031.123.456-75',
    ]);
    expect(variacoesDeCpf('03112345675')).toEqual([
      '03112345675',
      '031.123.456-75',
    ]);
  });

  // Busca parcial não gera variação mascarada: repetir a mesma string no `in`
  // só faria o Prisma comparar duas vezes o mesmo valor.
  it('não repete a variação quando não há máscara possível', () => {
    expect(variacoesDeCpf('0311234')).toEqual(['0311234']);
  });
});
