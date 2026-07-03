import { ConflictException } from '@nestjs/common';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
import {
  expandirSetoresDosDetalhes,
  normalizarDetalhes,
  validarDetalhesInternos,
} from './edicoes-range.util';

describe('edicoes-range.util', () => {
  it('expande setores individuais preservando a ordem por indiceRange', () => {
    const setores = expandirSetoresDosDetalhes([
      {
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoCartela: TipoCartela.DUAS_CHANCES,
        indiceRange: 1,
        rangeInicio: 1n,
        rangeFinal: 1000n,
        ordemConfiguracao: 0,
      },
      {
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoCartela: TipoCartela.DUAS_CHANCES,
        indiceRange: 2,
        rangeInicio: 1001n,
        rangeFinal: 2000n,
        ordemConfiguracao: 1,
      },
    ]);

    expect(setores).toHaveLength(2);
    expect(setores[0].indiceCartela).toBe(1);
    expect(setores[0].rangeInicio).toBe(1n);
    expect(setores[0].rangeFinal).toBe(1000n);
    expect(setores[1].indiceCartela).toBe(2);
    expect(setores[1].rangeInicio).toBe(1001n);
    expect(setores[1].rangeFinal).toBe(2000n);
  });

  it('permite ranges consecutivos sem sobreposicao', () => {
    expect(() =>
      validarDetalhesInternos([
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          indiceRange: 1,
          rangeInicio: 1n,
          rangeFinal: 1000n,
        },
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          indiceRange: 2,
          rangeInicio: 1001n,
          rangeFinal: 2000n,
        },
      ]),
    ).not.toThrow();
  });

  it('renumera indices repetidos por origem durante a normalizacao', () => {
    const detalhes = normalizarDetalhes([
      {
        origemParticipacao: OrigemParticipacao.DIGITAL,
        indiceRange: 1,
        rangeInicio: '0980000',
        rangeFinal: '0985000',
      },
      {
        origemParticipacao: OrigemParticipacao.DIGITAL,
        indiceRange: 1,
        rangeInicio: '0990000',
        rangeFinal: '0995000',
      },
    ]);

    expect(detalhes).toEqual([
      expect.objectContaining({
        origemParticipacao: OrigemParticipacao.DIGITAL,
        indiceRange: 1,
        rangeInicio: 980000n,
        rangeFinal: 985000n,
      }),
      expect.objectContaining({
        origemParticipacao: OrigemParticipacao.DIGITAL,
        indiceRange: 2,
        rangeInicio: 990000n,
        rangeFinal: 995000n,
      }),
    ]);
    expect(() => validarDetalhesInternos(detalhes)).not.toThrow();
  });

  it('rejeita ranges que se sobrepoem', () => {
    expect(() =>
      validarDetalhesInternos([
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          indiceRange: 1,
          rangeInicio: 1n,
          rangeFinal: 1000n,
        },
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          indiceRange: 2,
          rangeInicio: 900n,
          rangeFinal: 1899n,
        },
      ]),
    ).toThrow(ConflictException);
  });
});
