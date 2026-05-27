import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { OrigemParticipacao } from '@prisma/client';
import { CreateVendaDto } from './create-venda.dto';

function obterMensagensDeValidacao(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('CreateVendaDto', () => {
  it('should accept admin manual sale payload with quantidade alias and no valor', () => {
    const dto = plainToInstance(CreateVendaDto, {
      edicaoId: '4dde3ce8-d3d5-452a-b142-4808d4e06907',
      quantidade: 4,
      quantidadeCartelas: 4,
      cpf: '16158982636',
      dataNascimento: '2000-05-05',
      distribuidorId: 'ae7eeaa3-f692-49b2-9529-88a7fac023c0',
      email: '',
      nome: 'Jair Teste 2',
      origemParticipacao: OrigemParticipacao.DIGITAL,
      telefone: '(62) 99570-2191',
    });

    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(obterMensagensDeValidacao(errors)).toEqual([]);
  });

  it('should accept legacy payload with only quantidade', () => {
    const dto = plainToInstance(CreateVendaDto, {
      edicaoId: '4dde3ce8-d3d5-452a-b142-4808d4e06907',
      quantidade: 4,
      cpf: '16158982636',
      dataNascimento: '2000-05-05',
      nome: 'Jair Teste 2',
      telefone: '(62) 99570-2191',
    });

    const errors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(obterMensagensDeValidacao(errors)).toEqual([]);
  });
});
