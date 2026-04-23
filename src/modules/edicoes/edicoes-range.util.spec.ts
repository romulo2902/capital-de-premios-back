import { ConflictException } from '@nestjs/common';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
import {
  expandirSetoresDosDetalhes,
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
    expect(setores[0].indiceChance).toBe(1);
    expect(setores[0].rangeInicio).toBe(1n);
    expect(setores[0].rangeFinal).toBe(1000n);
    expect(setores[1].indiceChance).toBe(2);
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
