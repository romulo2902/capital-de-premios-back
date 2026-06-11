import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
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

export class ItemCartelaSenaDto {
  @ApiPropertyOptional({
    type: [Number],
    example: [3, 12, 24, 37, 45, 58],
    description:
      '6 números escolhidos (1–60). Obrigatório se modoSelecao=MANUAL. Omita para SURPRESINHA.',
  })
  @IsOptional()
  @IsArray({ message: 'numeros deve ser um array' })
  @IsInt({ each: true, message: 'cada número deve ser um inteiro' })
  @Min(1, { each: true, message: 'números devem ser entre 1 e 60' })
  @Max(60, { each: true, message: 'números devem ser entre 1 e 60' })
  @ArrayMinSize(6, { message: 'numeros deve conter exatamente 6 números' })
  @ArrayMaxSize(6, { message: 'numeros deve conter exatamente 6 números' })
  numeros?: number[];

  @ApiProperty({ enum: ModoSelecaoSena, example: ModoSelecaoSena.MANUAL })
  @IsEnum(ModoSelecaoSena, { message: 'modoSelecao deve ser MANUAL ou SURPRESINHA' })
  modoSelecao: ModoSelecaoSena;
}

export class CreateVendaSenaDto {
  @ApiProperty({ example: 'uuid-da-edicao-sena' })
  @IsUUID('4', { message: 'edicaoSenaId deve ser um UUID válido' })
  edicaoSenaId: string;

  @ApiPropertyOptional({
    type: [ItemCartelaSenaDto],
    description:
      'Lista explícita de cartelas (MANUAL=cliente digita os 6 números, SURPRESINHA=sistema gera). Omita para compra rápida — neste caso informe `quantidade` ou `comboSenaId` e o sistema gera todas as cartelas (surpresinha).',
  })
  @IsOptional()
  @IsArray({ message: 'cartelas deve ser um array' })
  @ValidateNested({ each: true })
  @Type(() => ItemCartelaSenaDto)
  @ArrayMinSize(1, { message: 'cartelas deve ter no mínimo 1 item' })
  cartelas?: ItemCartelaSenaDto[];

  @ApiPropertyOptional({
    example: 5,
    minimum: 1,
    maximum: 1000,
    description:
      'Compra rápida unitária: quantidade de cartelas a serem geradas automaticamente pelo sistema (todas SURPRESINHA, com 6 números + 7º aleatório). Ignorado quando `cartelas` é informado.',
  })
  @IsOptional()
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser no mínimo 1' })
  @Max(1000, { message: 'quantidade deve ser no máximo 1000' })
  quantidade?: number;

  @ApiPropertyOptional({
    example: 'uuid-do-combo',
    description:
      'ID do combo. Quando informado sem `cartelas`, o sistema gera automaticamente `combo.quantidade` cartelas surpresinha (compra rápida combo).',
  })
  @IsOptional()
  @IsUUID('4', { message: 'comboSenaId deve ser um UUID válido' })
  comboSenaId?: string;

  @ApiProperty({ enum: TipoPagamento, example: TipoPagamento.PIX })
  @IsEnum(TipoPagamento, { message: 'tipoPagamento inválido' })
  tipoPagamento: TipoPagamento;

  // Dados do cliente
  @ApiProperty({ example: '12345678900' })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  @IsCpfValido({ message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString({ message: 'nome deve ser um texto' })
  @MinLength(2, { message: 'nome deve ter no mínimo 2 caracteres' })
  nome: string;

  @ApiProperty({ example: '(11) 99999-9999' })
  @IsString({ message: 'telefone deve ser um texto' })
  telefone: string;

  @ApiProperty({
    example: 'maria@email.com',
    description: 'E-mail do cliente. Obrigatório para envio do comprovante de compra.',
  })
  @IsEmail({}, { message: 'e-mail inválido' })
  email!: string;

  @ApiProperty({
    example: '1985-04-11',
    description:
      'Data de nascimento do cliente no formato YYYY-MM-DD. Obrigatória para validar maioridade.',
  })
  @Transform(emptyStringToUndefined)
  @IsString({ message: 'dataNascimento deve ser um texto' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataNascimento deve estar no formato YYYY-MM-DD',
  })
  dataNascimento: string;

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
