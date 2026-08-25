import {
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  aplicarVinculoDoToken,
  resolverVinculoCliente,
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
