import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

const normalizeCpf = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/\D/g, '');
};

const normalizeNullableText = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();
  return normalizedValue === '' ? null : normalizedValue;
};

export class BuscarMeusDadosDto {
  @ApiProperty({
    example: '031.123.456-75',
    description: 'CPF do cliente com ou sem máscara.',
  })
  @Transform(normalizeCpf)
  @Matches(/^\d{11}$/, { message: 'CPF inválido' })
  cpf: string;
}

export class AtualizarMeusDadosDto {
  @ApiPropertyOptional({
    example: 'Tiago Lima',
    description: 'Nome completo do cliente.',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @ApiPropertyOptional({
    example: '(64) 98461-4339',
    description: 'Celular ou telefone com DDD.',
  })
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiPropertyOptional({
    example: 'tiago@email.com',
    description: 'E-mail do cliente. Envie string vazia para remover.',
    nullable: true,
  })
  @Transform(normalizeNullableText)
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({
    example: '1990-05-20',
    description: 'Data de nascimento no formato YYYY-MM-DD.',
  })
  @IsOptional()
  @IsISO8601()
  dataNascimento?: string;
}
