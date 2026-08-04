import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { criarExcecaoValidacao } from '../../../common/utils/validation-errors.util';
import { CreateEdicaoComboDto } from './create-edicao-combo.dto';
import { CreateEdicaoDto } from './create-edicao.dto';

/**
 * Contrato de entrada dos ranges (modelo novo).
 *
 * O range deixou de viver na edição (campos `detalhes` / `valorCartela`) e passou
 * a ser obrigatório dentro de CADA combo. Estes testes travam esse contrato: é
 * exatamente a divergência que fazia o painel admin tomar 400 ao criar edição.
 */
describe('CreateEdicaoComboDto — validacao de range', () => {
  function validarCombo(parcial: Partial<Record<string, unknown>>) {
    const dto = plainToInstance(CreateEdicaoComboDto, {
      origemParticipacao: 'DIGITAL',
      quantidadeCartelas: 2,
      preco: '20.00',
      rangeInicio: '0951000',
      rangeFinal: '0952000',
      ...parcial,
    });
    return validateSync(dto);
  }

  function mensagensDoCampo(
    erros: ReturnType<typeof validateSync>,
    campo: string,
  ): string[] {
    const erro = erros.find((e) => e.property === campo);
    return Object.values(erro?.constraints ?? {});
  }

  it('aceita combo valido com ranges de 7 digitos', () => {
    expect(validarCombo({})).toHaveLength(0);
  });

  it.each(['rangeInicio', 'rangeFinal'])(
    '%s é obrigatorio',
    (campo) => {
      const erros = validarCombo({ [campo]: undefined });
      expect(mensagensDoCampo(erros, campo).length).toBeGreaterThan(0);
    },
  );

  it.each(['rangeInicio', 'rangeFinal'])(
    '%s rejeita menos de 7 digitos',
    (campo) => {
      const erros = validarCombo({ [campo]: '123456' });
      expect(mensagensDoCampo(erros, campo).join(' ')).toMatch(/7 d[ií]gitos/i);
    },
  );

  it.each(['rangeInicio', 'rangeFinal'])(
    '%s rejeita caracteres nao numericos',
    (campo) => {
      const erros = validarCombo({ [campo]: '09510AB' });
      expect(mensagensDoCampo(erros, campo).join(' ')).toMatch(
        /apenas d[ií]gitos/i,
      );
    },
  );

  it.each(['rangeInicio', 'rangeFinal'])(
    '%s rejeita numero em vez de texto',
    (campo) => {
      const erros = validarCombo({ [campo]: 951000 });
      expect(mensagensDoCampo(erros, campo).length).toBeGreaterThan(0);
    },
  );

  it('aceita range com mais de 7 digitos', () => {
    expect(
      validarCombo({ rangeInicio: '10000000', rangeFinal: '10001000' }),
    ).toHaveLength(0);
  });

  it('combo aceita apenas origemParticipacao DIGITAL', () => {
    const erros = validarCombo({ origemParticipacao: 'FISICO' });
    expect(mensagensDoCampo(erros, 'origemParticipacao').join(' ')).toMatch(
      /apenas DIGITAL/i,
    );
  });
});

describe('CreateEdicaoDto — rejeicao dos campos legados de range', () => {
  // Mesma config do ValidationPipe global (src/main.ts), incluindo o
  // exceptionFactory de producao — é ele que monta o array {campo, mensagem}.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: criarExcecaoValidacao,
  });

  const metadata = {
    type: 'body' as const,
    metatype: CreateEdicaoDto,
  };

  interface CampoErro {
    campo: string;
    mensagem: string;
  }

  async function coletarErros(payload: unknown): Promise<CampoErro[]> {
    try {
      await pipe.transform(payload, metadata);
      return [];
    } catch (erro) {
      const resposta = (erro as BadRequestException).getResponse() as {
        errors?: CampoErro[];
      };
      return resposta.errors ?? [];
    }
  }

  const payloadValido = {
    numero: '001',
    dataSorteio: '2026-12-01T20:00',
    dataEncerramento: '2026-12-01T19:00',
    frase: 'teste',
    destino: 'AMBOS',
    raspadinha: false,
    manutencaoAtiva: false,
    combos: [
      {
        origemParticipacao: 'DIGITAL',
        quantidadeCartelas: 2,
        preco: '20.00',
        rangeInicio: '0951000',
        rangeFinal: '0952000',
      },
    ],
    premios: [{ descricao: 'Premio 1', valor: '1000.00' }],
  };

  it('aceita o payload no formato novo', async () => {
    await expect(coletarErros(payloadValido)).resolves.toHaveLength(0);
  });

  // O formulario do admin manda o campo sempre, com string vazia quando o
  // usuario nao preenche. @IsOptional() so pula null/undefined, entao sem o
  // @Transform o @Matches barrava o cadastro — 400 em quem deixou em branco.
  it('aceita intervalo em branco, tratando como nao informado', async () => {
    await expect(
      coletarErros({ ...payloadValido, intervalo: '' }),
    ).resolves.toHaveLength(0);
  });

  it('aceita intervalo preenchido', async () => {
    await expect(
      coletarErros({ ...payloadValido, intervalo: '50000' }),
    ).resolves.toHaveLength(0);
  });

  it('rejeita intervalo nao numerico', async () => {
    const erros = await coletarErros({
      ...payloadValido,
      intervalo: 'cinquenta mil',
    });

    expect(erros.map((e) => e.campo)).toContain('intervalo');
  });

  it.each(['valorCartela', 'detalhes'])(
    'rejeita o campo legado %s',
    async (campo) => {
      const erros = await coletarErros({
        ...payloadValido,
        [campo]: campo === 'detalhes' ? [] : '0.11',
      });

      expect(erros).toContainEqual({
        campo,
        mensagem: `property ${campo} should not exist`,
      });
    },
  );

  it('rejeita combo sem range, apontando o indice do combo', async () => {
    const erros = await coletarErros({
      ...payloadValido,
      combos: [
        {
          origemParticipacao: 'DIGITAL',
          quantidadeCartelas: 2,
          preco: '20.00',
        },
      ],
    });

    const campos = erros.map((e) => e.campo);
    expect(campos).toContain('combos.0.rangeInicio');
    expect(campos).toContain('combos.0.rangeFinal');
  });

  it('exige ao menos um combo', async () => {
    const erros = await coletarErros({ ...payloadValido, combos: [] });

    expect(erros.map((e) => e.mensagem).join(' ')).toMatch(
      /combos deve ter no m[ií]nimo 1 item/i,
    );
  });
});
