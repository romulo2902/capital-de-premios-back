import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

interface CampoErro {
  campo: string;
  mensagem: string;
}

function achatar(
  errors: ValidationError[],
  prefix = '',
): CampoErro[] {
  return errors.flatMap((error) => {
    const campo = prefix ? `${prefix}.${error.property}` : error.property;
    const mensagens = Object.values(error.constraints ?? {}).map((msg) => ({
      campo,
      mensagem: msg,
    }));
    const aninhados = error.children?.length
      ? achatar(error.children, campo)
      : [];
    return [...mensagens, ...aninhados];
  });
}

export function criarExcecaoValidacao(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    message: 'Dados inválidos',
    errors: achatar(errors),
  });
}
