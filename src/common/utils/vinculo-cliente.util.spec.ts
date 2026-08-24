import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { resolverVinculoCliente } from './vinculo-cliente.util';

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

    it('vendedor e distribuidor divergentes → ConflictException', () => {
      expect(() =>
        resolverVinculoCliente({
          vendedorId: 'vendedor-1',
          distribuidorId: 'outro-distribuidor',
          distribuidorDoVendedor: DIST,
        }),
      ).toThrow(ConflictException);
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

    it('distribuidor vazio nao conta como divergencia', () => {
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
