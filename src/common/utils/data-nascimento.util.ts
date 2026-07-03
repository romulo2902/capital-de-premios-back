import { BadRequestException } from '@nestjs/common';

interface ParseDataNascimentoOptions {
  allowBrazilianFormat?: boolean;
}

export function parseDataNascimento(
  value: string,
  options?: ParseDataNascimentoOptions,
): Date {
  const valorNormalizado = value.trim();

  if (!valorNormalizado) {
    throw new BadRequestException('dataNascimento é obrigatória');
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valorNormalizado);
  if (isoMatch) {
    return validarDataCalendario(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  if (options?.allowBrazilianFormat) {
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valorNormalizado);
    if (brMatch) {
      return validarDataCalendario(
        Number(brMatch[3]),
        Number(brMatch[2]),
        Number(brMatch[1]),
      );
    }

    throw new BadRequestException(
      'dataNascimento deve estar no formato DD/MM/YYYY ou YYYY-MM-DD',
    );
  }

  throw new BadRequestException('dataNascimento deve estar no formato YYYY-MM-DD');
}

export function validarMaioridade(
  dataNascimento: Date,
  idadeMinima = 18,
): void {
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - dataNascimento.getUTCFullYear();
  const mesAtual = hoje.getUTCMonth();
  const diaAtual = hoje.getUTCDate();
  const mesNascimento = dataNascimento.getUTCMonth();
  const diaNascimento = dataNascimento.getUTCDate();

  if (
    mesAtual < mesNascimento ||
    (mesAtual === mesNascimento && diaAtual < diaNascimento)
  ) {
    idade -= 1;
  }

  if (idade < idadeMinima) {
    throw new BadRequestException('Produto proibido para menores de 18 anos');
  }
}

export function parseEValidarDataNascimento(
  value: string,
  options?: ParseDataNascimentoOptions,
): Date {
  const dataNascimento = parseDataNascimento(value, options);
  validarMaioridade(dataNascimento);
  return dataNascimento;
}

function validarDataCalendario(year: number, month: number, day: number): Date {
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new BadRequestException('dataNascimento inválida');
  }

  return candidate;
}
