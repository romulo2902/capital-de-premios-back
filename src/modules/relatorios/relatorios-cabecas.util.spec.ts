import { reconstruirCartelasDaVenda } from './relatorios-cabecas.util';

describe('reconstruirCartelasDaVenda', () => {
  it('combo 2x com quantidade 2 vira duas cartelas com uma chance cada', () => {
    const cartelas = reconstruirCartelasDaVenda(
      [50002n, 1n, 50001n, 2n],
      2,
      50000n,
    );

    expect(cartelas).toEqual([
      { cabeca: 1n, chances: [50001n] },
      { cabeca: 2n, chances: [50002n] },
    ]);
  });

  it('não confunde chance de uma cartela com cabeça de outra quando ela é menor', () => {
    // Range de cabeça 1–100.000, intervalo 50.000: a chance 50.010 da cabeça 10
    // é menor que a cabeça 60.000. Pegar os N menores erraria aqui.
    const cartelas = reconstruirCartelasDaVenda(
      [10n, 50010n, 60000n, 110000n],
      2,
      50000n,
    );

    expect(cartelas.map((c) => c.cabeca)).toEqual([10n, 60000n]);
  });

  it('com intervalo 1 agrupa títulos consecutivos', () => {
    const cartelas = reconstruirCartelasDaVenda(
      [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
      4,
      1n,
    );

    expect(cartelas).toEqual([
      { cabeca: 1n, chances: [2n, 3n, 4n] },
      { cabeca: 5n, chances: [6n, 7n, 8n] },
    ]);
  });

  it('em cartela de uma chance todo título é cabeça', () => {
    const cartelas = reconstruirCartelasDaVenda([3n, 1n, 2n], 1, 50000n);

    expect(cartelas).toEqual([
      { cabeca: 1n, chances: [] },
      { cabeca: 2n, chances: [] },
      { cabeca: 3n, chances: [] },
    ]);
  });
});
