import { BadRequestException } from '@nestjs/common';
import { OrigemParticipacao, TipoCartela } from '@prisma/client';
import {
  expandirSetoresDosDetalhes,
  validarDetalhesInternos,
} from './edicoes-range.util';

describe('edicoes-range.util', () => {
  it('expande DUAS_CHANCES manual respeitando pares por indiceChance', () => {
    const setores = expandirSetoresDosDetalhes([
      {
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoCartela: TipoCartela.DUAS_CHANCES,
        indiceChance: 1,
        rangeInicio: 950000n,
        rangeFinal: 959980n,
        ordemConfiguracao: 0,
      },
      {
        origemParticipacao: OrigemParticipacao.DIGITAL,
        tipoCartela: TipoCartela.DUAS_CHANCES,
        indiceChance: 2,
        rangeInicio: 1050000n,
        rangeFinal: 1059980n,
        ordemConfiguracao: 1,
      },
    ]);

    expect(setores).toHaveLength(2);
    expect(setores[0].indiceChance).toBe(1);
    expect(setores[1].indiceChance).toBe(2);
    expect(setores[0].quantidadeCombos).toBe(9981n);
    expect(setores[1].quantidadeCombos).toBe(9981n);
  });

  it('rejeita grupo manual com tamanhos diferentes', () => {
    expect(() =>
      validarDetalhesInternos([
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          indiceChance: 1,
          rangeInicio: 950000n,
          rangeFinal: 959980n,
        },
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          indiceChance: 2,
          rangeInicio: 1050000n,
          rangeFinal: 1059999n,
        },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejeita grupo manual com indiceChance parcial', () => {
    expect(() =>
      validarDetalhesInternos([
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          indiceChance: 1,
          rangeInicio: 950000n,
          rangeFinal: 959980n,
        },
        {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DUAS_CHANCES,
          rangeInicio: 1050000n,
          rangeFinal: 1059980n,
        },
      ]),
    ).toThrow(BadRequestException);
  });
});
