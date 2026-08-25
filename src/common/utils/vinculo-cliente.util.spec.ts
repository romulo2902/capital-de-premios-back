import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  aplicarVinculoDoToken,
  garantirVendedorDaRedeDoDistribuidor,
  resolverVinculoCliente,
  resolverVinculoClienteNaAtualizacao,
  resolverVinculoDaCompra,
} from './vinculo-cliente.util';
import type {
  EntradaVinculoAtualizacao,
  VinculoCliente,
} from './vinculo-cliente.util';

describe('resolverVinculoCliente', () => {
  const DIST = 'distribuidor-do-vendedor';

  describe('tabela-verdade', () => {
    it('nada informado → null (chamador decide)', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: null,
          distribuidorId: null,
        }),
      ).toBeNull();
    });

    it('vendedor sem distribuidor informado → deriva do vendedor', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: 'vendedor-1',
          distribuidorId: null,
          distribuidorDoVendedor: DIST,
        }),
      ).toEqual({ vendedorId: 'vendedor-1', distribuidorId: DIST });
    });

    it('vendedor e distribuidor coincidentes → aceita', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: 'vendedor-1',
          distribuidorId: DIST,
          distribuidorDoVendedor: DIST,
        }),
      ).toEqual({ vendedorId: 'vendedor-1', distribuidorId: DIST });
    });

    it('vendedor e distribuidor divergentes → o informado vence', () => {
      // Decisao de projeto: valor explicito na requisicao e autoritativo.
      // A coerencia e garantida no controller, que so deixa ADMIN informar
      // distribuidorId — VENDEDOR e DISTRIBUIDOR herdam do token.
      expect(
        resolverVinculoCliente({
          vendedorId: 'vendedor-1',
          distribuidorId: 'outro-distribuidor',
          distribuidorDoVendedor: DIST,
        }),
      ).toEqual({
        vendedorId: 'vendedor-1',
        distribuidorId: 'outro-distribuidor',
      });
    });

    it('vendedor com distribuidor informado e sem derivacao → usa o informado', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: 'vendedor-1',
          distribuidorId: 'distribuidor-1',
          distribuidorDoVendedor: null,
        }),
      ).toEqual({
        vendedorId: 'vendedor-1',
        distribuidorId: 'distribuidor-1',
      });
    });

    it('somente distribuidor → vincula sem vendedor', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: null,
          distribuidorId: 'distribuidor-1',
        }),
      ).toEqual({ vendedorId: null, distribuidorId: 'distribuidor-1' });
    });

    it('vendedor sem distribuidor resolvido → falha em vez de gravar estado incoerente', () => {
      expect(() =>
        resolverVinculoCliente({
          vendedorId: 'vendedor-1',
          distribuidorId: null,
          distribuidorDoVendedor: null,
        }),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('normalizacao de entrada', () => {
    it('trata undefined como ausencia', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: undefined,
          distribuidorId: undefined,
        }),
      ).toBeNull();
    });

    it('trata string vazia como ausencia', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: '   ',
          distribuidorId: '',
        }),
      ).toBeNull();
    });

    it('remove espacos em volta dos ids', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: '  vendedor-1  ',
          distribuidorId: null,
          distribuidorDoVendedor: DIST,
        }),
      ).toEqual({ vendedorId: 'vendedor-1', distribuidorId: DIST });
    });

    it('distribuidor vazio cai na derivacao, nao sobrescreve com vazio', () => {
      expect(
        resolverVinculoCliente({
          vendedorId: 'vendedor-1',
          distribuidorId: '  ',
          distribuidorDoVendedor: DIST,
        }),
      ).toEqual({ vendedorId: 'vendedor-1', distribuidorId: DIST });
    });
  });

  describe('invariante de saida', () => {
    // A CHECK constraint da etapa 4 recusa (vendedorId != null, distribuidorId
    // null). Nenhuma combinacao de entrada pode produzir esse par.
    const entradas = [
      { vendedorId: null, distribuidorId: null },
      { vendedorId: null, distribuidorId: 'distribuidor-1' },
      {
        vendedorId: 'vendedor-1',
        distribuidorId: null,
        distribuidorDoVendedor: DIST,
      },
      {
        vendedorId: 'vendedor-1',
        distribuidorId: DIST,
        distribuidorDoVendedor: DIST,
      },
      {
        vendedorId: 'vendedor-1',
        distribuidorId: 'outro-distribuidor',
        distribuidorDoVendedor: DIST,
      },
    ];

    it.each(entradas)(
      'nunca devolve vendedor sem distribuidor (%j)',
      (entrada) => {
        const resultado = resolverVinculoCliente(entrada);

        if (resultado?.vendedorId) {
          expect(resultado.distribuidorId).not.toBeNull();
        }
      },
    );
  });
});

describe('aplicarVinculoDoToken', () => {
  const dto = (extra: Record<string, string> = {}) => ({
    vendedorId: 'vendedor-do-corpo',
    distribuidorId: 'distribuidor-do-corpo',
    seller_id: 'seller-do-corpo',
    ...extra,
  });

  it('VENDEDOR: forca o proprio vendedor e descarta o resto', () => {
    const payload = dto();

    aplicarVinculoDoToken(payload, {
      perfil: 'VENDEDOR',
      vendedorId: 'vendedor-logado',
    });

    expect(payload.vendedorId).toBe('vendedor-logado');
    expect(payload.distribuidorId).toBeUndefined();
    expect(payload.seller_id).toBeUndefined();
  });

  it('DISTRIBUIDOR: forca o proprio distribuidor e preserva o vendedor', () => {
    const payload = dto();

    aplicarVinculoDoToken(payload, {
      perfil: 'DISTRIBUIDOR',
      distribuidorId: 'distribuidor-logado',
    });

    expect(payload.distribuidorId).toBe('distribuidor-logado');
    // Preservado de proposito: o service valida se o vendedor e da rede dele.
    expect(payload.vendedorId).toBe('vendedor-do-corpo');
    expect(payload.seller_id).toBeUndefined();
  });

  it('ADMIN: nao mexe em nada', () => {
    const payload = dto();

    aplicarVinculoDoToken(payload, { perfil: 'ADMIN' });

    expect(payload).toEqual({
      vendedorId: 'vendedor-do-corpo',
      distribuidorId: 'distribuidor-do-corpo',
      seller_id: 'seller-do-corpo',
    });
  });

  it('recusa VENDEDOR sem vinculo no token em vez de deixar o corpo decidir', () => {
    const payload = dto();

    expect(() =>
      aplicarVinculoDoToken(payload, { perfil: 'VENDEDOR' }),
    ).toThrow(ForbiddenException);

    expect(payload.distribuidorId).toBe('distribuidor-do-corpo');
  });

  it('recusa DISTRIBUIDOR sem vinculo no token', () => {
    expect(() =>
      aplicarVinculoDoToken(dto(), { perfil: 'DISTRIBUIDOR' }),
    ).toThrow(ForbiddenException);
  });
});

describe('resolverVinculoClienteNaAtualizacao', () => {
  const V = 'vendedor-rede-A';
  const A = 'distribuidor-A';
  const B = 'distribuidor-B';

  // Tabela-verdade exaustiva: campo ausente (undefined) / vazio (null) / com
  // valor, cruzado com o estado do cadastro. Cada linha e um caso que ja
  // apareceu — ou poderia aparecer — numa rodada de revisao.
  const casos: Array<{
    nome: string;
    entrada: EntradaVinculoAtualizacao;
    esperado: VinculoCliente;
  }> = [
    {
      nome: 'so vendedor informado → vence e deriva a rede dele',
      entrada: {
        vendedorInformado: V,
        distribuidorInformado: undefined,
        vendedorAtual: null,
        distribuidorAtual: B,
        distribuidorDoVendedor: A,
      },
      esperado: { vendedorId: V, distribuidorId: A },
    },
    {
      nome: 'vendedor e distribuidor informados → explicito vence nos dois',
      entrada: {
        vendedorInformado: V,
        distribuidorInformado: B,
        vendedorAtual: null,
        distribuidorAtual: null,
        distribuidorDoVendedor: A,
      },
      esperado: { vendedorId: V, distribuidorId: B },
    },
    {
      nome: 'vendedor vazio informado → desvincula e preserva a rede',
      entrada: {
        vendedorInformado: null,
        distribuidorInformado: undefined,
        vendedorAtual: V,
        distribuidorAtual: A,
        distribuidorDoVendedor: null,
      },
      esperado: { vendedorId: null, distribuidorId: A },
    },
    {
      nome: 'vendedor e distribuidor vazios → orfana o cliente',
      entrada: {
        vendedorInformado: null,
        distribuidorInformado: null,
        vendedorAtual: V,
        distribuidorAtual: A,
        distribuidorDoVendedor: null,
      },
      esperado: { vendedorId: null, distribuidorId: null },
    },
    {
      nome: 'so distribuidor informado, rede MUDA e vendedor e de outra → cede',
      entrada: {
        vendedorInformado: undefined,
        distribuidorInformado: B,
        vendedorAtual: V,
        distribuidorAtual: A,
        distribuidorDoVendedor: A,
      },
      esperado: { vendedorId: null, distribuidorId: B },
    },
    {
      nome: 'so distribuidor informado, IGUAL ao atual → idempotente',
      entrada: {
        vendedorInformado: undefined,
        distribuidorInformado: B,
        vendedorAtual: V,
        distribuidorAtual: B,
        distribuidorDoVendedor: A,
      },
      esperado: { vendedorId: V, distribuidorId: B },
    },
    {
      nome: 'so distribuidor informado e vendedor ja e da rede → preserva',
      entrada: {
        vendedorInformado: undefined,
        distribuidorInformado: B,
        vendedorAtual: V,
        distribuidorAtual: A,
        distribuidorDoVendedor: B,
      },
      esperado: { vendedorId: V, distribuidorId: B },
    },
    {
      nome: 'so distribuidor informado e cliente sem vendedor → troca a rede',
      entrada: {
        vendedorInformado: undefined,
        distribuidorInformado: B,
        vendedorAtual: null,
        distribuidorAtual: A,
        distribuidorDoVendedor: null,
      },
      esperado: { vendedorId: null, distribuidorId: B },
    },
    {
      nome: 'distribuidor vazio e cliente sem vendedor → orfana',
      entrada: {
        vendedorInformado: undefined,
        distribuidorInformado: null,
        vendedorAtual: null,
        distribuidorAtual: A,
        distribuidorDoVendedor: null,
      },
      esperado: { vendedorId: null, distribuidorId: null },
    },
    {
      nome: 'vendedor informado com distribuidor vazio → deriva do vendedor',
      entrada: {
        vendedorInformado: V,
        distribuidorInformado: null,
        vendedorAtual: null,
        distribuidorAtual: null,
        distribuidorDoVendedor: A,
      },
      esperado: { vendedorId: V, distribuidorId: A },
    },
  ];

  it.each(casos)('$nome', ({ entrada, esperado }) => {
    expect(resolverVinculoClienteNaAtualizacao(entrada)).toEqual(esperado);
  });

  it('recusa esvaziar o distribuidor de um cliente cujo vendedor veio do cadastro', () => {
    // Honrar o pedido exigiria apagar o vendedorId, que o chamador nao citou.
    expect(() =>
      resolverVinculoClienteNaAtualizacao({
        vendedorInformado: undefined,
        distribuidorInformado: null,
        vendedorAtual: V,
        distribuidorAtual: A,
        distribuidorDoVendedor: A,
      }),
    ).toThrow(BadRequestException);
  });

  it('nenhuma saida devolve vendedor sem distribuidor', () => {
    for (const { entrada } of casos) {
      const r = resolverVinculoClienteNaAtualizacao(entrada);
      if (r.vendedorId) {
        expect(r.distribuidorId).not.toBeNull();
      }
    }
  });

  // ─── REGRESSAO: omitir distribuidorDoVendedor apagava o vendedor calado ──
  // O TypeScript agora obriga o campo (string | null, sem undefined). Este
  // teste cobre quem contorna o tipo — o guard em runtime tem de barrar.
  it('recusa silenciar: vendedor final sem distribuidorDoVendedor lanca em vez de desvincular', () => {
    expect(() =>
      resolverVinculoClienteNaAtualizacao({
        vendedorInformado: undefined,
        distribuidorInformado: B,
        vendedorAtual: V,
        distribuidorAtual: A,
        // Contorna o tipo de propósito: simula quem esquece o campo.
      } as EntradaVinculoAtualizacao),
    ).toThrow(InternalServerErrorException);
  });

  it('mesmo caso com distribuidorDoVendedor correto NAO lanca e cede como esperado', () => {
    // Prova que o guard acima não é largo demais: com o campo presente, o
    // caso "rede muda de verdade" segue funcionando.
    expect(
      resolverVinculoClienteNaAtualizacao({
        vendedorInformado: undefined,
        distribuidorInformado: B,
        vendedorAtual: V,
        distribuidorAtual: A,
        distribuidorDoVendedor: A,
      }),
    ).toEqual({ vendedorId: null, distribuidorId: B });
  });
});

describe('garantirVendedorDaRedeDoDistribuidor', () => {
  it('recusa vendedor de outra rede para DISTRIBUIDOR', () => {
    expect(() =>
      garantirVendedorDaRedeDoDistribuidor(
        { distribuidorId: 'outra' },
        {
          perfil: 'DISTRIBUIDOR',
          distribuidorId: 'minha',
        },
      ),
    ).toThrow(ForbiddenException);
  });

  it('aceita vendedor da propria rede', () => {
    expect(() =>
      garantirVendedorDaRedeDoDistribuidor(
        { distribuidorId: 'minha' },
        {
          perfil: 'DISTRIBUIDOR',
          distribuidorId: 'minha',
        },
      ),
    ).not.toThrow();
  });

  it('nao age para ADMIN nem sem vendedor', () => {
    expect(() =>
      garantirVendedorDaRedeDoDistribuidor(
        { distribuidorId: 'outra' },
        {
          perfil: 'ADMIN',
        },
      ),
    ).not.toThrow();
    expect(() =>
      garantirVendedorDaRedeDoDistribuidor(null, {
        perfil: 'DISTRIBUIDOR',
        distribuidorId: 'minha',
      }),
    ).not.toThrow();
  });
});

describe('resolverVinculoDaCompra', () => {
  const V = 'vendedor-1';
  const D = 'distribuidor-1';

  it('nada informado → objeto vazio, chamador nao consulta o vendedor', async () => {
    const buscar = jest.fn();

    const vinculo = await resolverVinculoDaCompra(buscar);

    expect(vinculo).toEqual({});
    expect(buscar).not.toHaveBeenCalled();
  });

  it('so vendedor informado → busca a rede dele e deriva', async () => {
    const buscar = jest.fn().mockResolvedValue(D);

    const vinculo = await resolverVinculoDaCompra(buscar, V);

    expect(vinculo).toEqual({ vendedorId: V, distribuidorId: D });
    expect(buscar).toHaveBeenCalledWith(V);
  });

  it('distribuidorDoVendedorConhecido informado → pula a consulta', async () => {
    const buscar = jest.fn();

    const vinculo = await resolverVinculoDaCompra(buscar, V, undefined, D);

    expect(vinculo).toEqual({ vendedorId: V, distribuidorId: D });
    expect(buscar).not.toHaveBeenCalled();
  });

  it('vendedor informado e distribuidor explicito → explicito vence', async () => {
    const buscar = jest.fn().mockResolvedValue(D);
    const outro = 'distribuidor-2';

    const vinculo = await resolverVinculoDaCompra(buscar, V, outro);

    expect(vinculo).toEqual({ vendedorId: V, distribuidorId: outro });
  });

  it('vendedor nao encontrado pelo callback → 404, nao grava par incoerente', async () => {
    const buscar = jest.fn().mockResolvedValue(null);

    await expect(resolverVinculoDaCompra(buscar, V)).rejects.toThrow(
      'Vendedor não encontrado',
    );
  });

  it('so distribuidor informado → vincula sem vendedor, sem consultar', async () => {
    const buscar = jest.fn();

    const vinculo = await resolverVinculoDaCompra(buscar, undefined, D);

    expect(vinculo).toEqual({ vendedorId: null, distribuidorId: D });
    expect(buscar).not.toHaveBeenCalled();
  });
});
