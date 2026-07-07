import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ModoSelecaoSena, TipoPagamento } from '@prisma/client';
import { IsCpfValido } from '../../../../common/validators/cpf.validator';

const emptyStringToUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
};

export class ItemNumerosSenaDto {
  @ApiProperty({
    type: [Number],
    example: [3, 12, 24, 37, 45, 58],
    description:
      '6 números escolhidos pelo frontend para a cartela Sena (1–60).',
  })
  @IsArray({ message: 'numeros deve ser um array' })
  @IsInt({ each: true, message: 'cada número deve ser um inteiro' })
  @Min(1, { each: true, message: 'números devem ser entre 1 e 60' })
  @Max(60, { each: true, message: 'números devem ser entre 1 e 60' })
  @ArrayMinSize(6, { message: 'numeros deve conter exatamente 6 números' })
  @ArrayMaxSize(6, { message: 'numeros deve conter exatamente 6 números' })
  numeros: number[];

  @ApiProperty({
    example: 7,
    description:
      'Bola extra enviada pelo frontend. É persistida como o 7º número da cartela.',
  })
  @IsInt({ message: 'bola_extra deve ser um inteiro' })
  @Min(1, { message: 'bola_extra deve estar entre 1 e 60' })
  @Max(60, { message: 'bola_extra deve estar entre 1 e 60' })
  bola_extra: number;
}

export class CreateVendaSenaDto {
  @ApiProperty({ example: 'uuid-da-edicao-sena' })
  @IsUUID('4', { message: 'edicaoSenaId deve ser um UUID válido' })
  edicaoSenaId: string;

  @ApiProperty({
    enum: ModoSelecaoSena,
    example: ModoSelecaoSena.MANUAL,
    description:
      'Origem da escolha dos números para todas as cartelas da venda. O frontend sempre envia os números, inclusive para SURPRESINHA.',
  })
  @IsEnum(ModoSelecaoSena, {
    message: 'modoSelecao deve ser MANUAL ou SURPRESINHA',
  })
  modoSelecao: ModoSelecaoSena;

  @ApiProperty({
    type: [ItemNumerosSenaDto],
    example: [
      {
        numeros: [1, 2, 3, 4, 5, 6],
        bola_extra: 7,
      },
    ],
    description:
      'Lista de cartelas Sena enviada pelo frontend. Cada item tem exatamente 6 números e a bola extra (7º número).',
  })
  @IsArray({ message: 'numeros deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => ItemNumerosSenaDto)
  @ArrayMinSize(1, { message: 'numeros deve ter no mínimo 1 item' })
  numeros: ItemNumerosSenaDto[];

  @ApiPropertyOptional({
    example: 3,
    minimum: 1,
    maximum: 1000,
    description:
      'Quantidade esperada de cartelas. Quando omitida, a API usa a quantidade de itens em `numeros`.',
  })
  @IsOptional()
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser no mínimo 1' })
  @Max(1000, { message: 'quantidade deve ser no máximo 1000' })
  quantidade?: number;

  @ApiPropertyOptional({
    example: 'uuid-do-combo',
    description:
      'ID do combo. Quando informado, a quantidade de itens em `numeros` deve bater com a quantidade do combo.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'comboSenaId deve ser um UUID válido' })
  comboSenaId?: string;

  @ApiProperty({ enum: TipoPagamento, example: TipoPagamento.PIX })
  @IsEnum(TipoPagamento, { message: 'tipoPagamento inválido' })
  tipoPagamento: TipoPagamento;

  // Dados do cliente
  @ApiPropertyOptional({
    example: '76253924-363d-4220-a09c-2218712aa483',
    description:
      'ID do cliente já cadastrado. Quando informado, a API usa os dados completos do cadastro e os campos cpf/nome/telefone/email/dataNascimento não precisam ser enviados.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'clienteId deve ser um UUID válido' })
  clienteId?: string;

  @ApiPropertyOptional({
    example: '12345678900',
    description:
      'CPF do cliente. Obrigatório apenas quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaSenaDto) => !dto.clienteId)
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  @IsCpfValido({ message: 'CPF inválido' })
  cpf?: string;

  @ApiPropertyOptional({
    example: 'Maria Silva',
    description:
      'Nome do cliente. Obrigatório apenas quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaSenaDto) => !dto.clienteId)
  @IsString({ message: 'nome deve ser um texto' })
  @MinLength(2, { message: 'nome deve ter no mínimo 2 caracteres' })
  nome?: string;

  @ApiPropertyOptional({
    example: '(11) 99999-9999',
    description:
      'Telefone do cliente. Obrigatório apenas quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaSenaDto) => !dto.clienteId)
  @IsString({ message: 'telefone deve ser um texto' })
  telefone?: string;

  @ApiPropertyOptional({
    example: 'maria@email.com',
    description:
      'E-mail do cliente. Obrigatório para envio do comprovante quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaSenaDto) => !dto.clienteId)
  @IsEmail({}, { message: 'e-mail inválido' })
  email?: string;

  @ApiPropertyOptional({
    example: '1985-04-11',
    description:
      'Data de nascimento do cliente no formato YYYY-MM-DD. Obrigatória para validar maioridade quando clienteId não for informado.',
  })
  @Transform(emptyStringToUndefined)
  @ValidateIf((dto: CreateVendaSenaDto) => !dto.clienteId)
  @IsString({ message: 'dataNascimento deve ser um texto' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataNascimento deve estar no formato YYYY-MM-DD',
  })
  dataNascimento?: string;

  // Origem da venda
  @ApiPropertyOptional({ example: 'uuid-do-vendedor' })
  @IsOptional()
  @IsUUID('4', { message: 'vendedorId deve ser um UUID válido' })
  vendedorId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-distribuidor' })
  @IsOptional()
  @IsUUID('4', { message: 'distribuidorId deve ser um UUID válido' })
  distribuidorId?: string;

  @ApiPropertyOptional({
    example: 'cfda6bc8-665d-4735-a217-3f51775d431c',
    description:
      'ID do usuário vendedor/distribuidor recebido pela URL da loja (?seller_id=...).',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsUUID('4', { message: 'seller_id deve ser um UUID válido' })
  seller_id?: string;
}
