import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  IsArray,
  IsIn,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OrigemParticipacao, TipoPagamento } from '@prisma/client';

const emptyStringToUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
};

export class CreateVendaDto {
  @ApiProperty({
    example: 'uuid-da-edicao',
    description: 'ID da edição/sorteio a ser comprada.',
  })
  @IsUUID('4', { message: 'edicaoId deve ser um UUID válido' })
  edicaoId: string;

  @ApiPropertyOptional({
    example: 30.0,
    description:
      'Valor total legado enviado pelo frontend. A API recalcula o total pela configuração da edição.',
  })
  @Type(() => Number)
  @IsOptional()
  @Min(0, { message: 'valor deve ser maior ou igual a 0' })
  valor?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Quantidade de itens sendo comprados (ex: quantidade de combos ou quantidade de cartelas avulsas). O campo legado quantidade também é aceito.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'quantidadeCartelas deve ser um número inteiro' })
  @Min(1, { message: 'quantidadeCartelas deve ser no mínimo 1' })
  quantidadeCartelas?: number;

  @ApiHideProperty()
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'quantidade deve ser um número inteiro' })
  @Min(1, { message: 'quantidade deve ser no mínimo 1' })
  quantidade?: number;

  @ApiPropertyOptional({
    example: 'uuid-do-combo',
    description: 'ID do combo (se for uma compra de combo)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'comboId deve ser um UUID válido' })
  comboId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Números base selecionados explicitamente pelo vendedor/cliente (apenas para compras unitárias)',
  })
  @IsOptional()
  @IsArray({ message: 'cartelasSelecionadas deve ser um array' })
  @IsString({ each: true, message: 'cada item de cartelasSelecionadas deve ser um texto' })
  cartelasSelecionadas?: string[];

  @ApiPropertyOptional({
    enum: TipoPagamento,
    example: TipoPagamento.MANUAL,
    description:
      'Método de pagamento. Em venda direta do ADMIN pode ser omitido, pois a API força `MANUAL` automaticamente; demais perfis devem informar `PIX` ou `CARTAO`.',
  })
  @IsOptional()
  @IsEnum(TipoPagamento, { message: 'tipoPagamento inválido' })
  tipoPagamento?: TipoPagamento;

  @ApiPropertyOptional({
    enum: [OrigemParticipacao.DIGITAL],
    example: OrigemParticipacao.DIGITAL,
    description:
      'Origem da participação. Default: DIGITAL. Vendas POS possuem canal próprio em /pos.',
  })
  @IsOptional()
  @IsEnum(OrigemParticipacao, { message: 'origemParticipacao inválida' })
  @IsIn([OrigemParticipacao.DIGITAL], {
    message: 'origemParticipacao aceita apenas DIGITAL',
  })
  origemParticipacao?: OrigemParticipacao;

  @ApiPropertyOptional({
    type: [String],
    example: ['1234567', '7654321'],
    description: 'Combos específicos escolhidos pelo vendedor/cliente',
  })
  @IsOptional()
  @IsArray({ message: 'combosSelecionados deve ser um array' })
  @IsString({ each: true, message: 'cada item de combosSelecionados deve ser um texto' })
  combosSelecionados?: string[];

  // --- Dados do cliente (auto-cadastro/lookup por CPF, ou referência por clienteId) ---

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
      'CPF do cliente (somente números, 11 dígitos). Obrigatório apenas quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaDto) => !dto.clienteId)
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf?: string;

  @ApiPropertyOptional({
    example: 'Romulo Valadares',
    description:
      'Nome completo do cliente. Obrigatório apenas quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaDto) => !dto.clienteId)
  @IsString({ message: 'nome deve ser um texto' })
  @MinLength(2, { message: 'nome deve ter no mínimo 2 caracteres' })
  nome?: string;

  @ApiPropertyOptional({
    example: '(00) 99999-9999',
    description:
      'Telefone do cliente com DDD. Obrigatório apenas quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaDto) => !dto.clienteId)
  @IsString({ message: 'telefone deve ser um texto' })
  telefone?: string;

  @ApiPropertyOptional({
    example: 'romulo.valadares@email.com',
    description:
      'E-mail do cliente. Obrigatório para envio do comprovante de compra quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaDto) => !dto.clienteId)
  @IsEmail({}, { message: 'e-mail inválido' })
  email?: string;

  @ApiPropertyOptional({
    example: '1985-04-11',
    description:
      'Data de nascimento do cliente no formato YYYY-MM-DD. Obrigatória para validar maioridade quando clienteId não for informado.',
  })
  @ValidateIf((dto: CreateVendaDto) => !dto.clienteId)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataNascimento deve estar no formato YYYY-MM-DD',
  })
  dataNascimento?: string;

  // --- Origem da venda ---

  @ApiPropertyOptional({
    example: 'uuid-do-vendedor',
    description: 'ID do vendedor que originou a venda (opcional).',
  })
  @IsOptional()
  @IsUUID('4', { message: 'vendedorId deve ser um UUID válido' })
  vendedorId?: string;

  @ApiPropertyOptional({
    example: 'uuid-do-distribuidor',
    description: 'ID do distribuidor que originou a venda (opcional).',
  })
  @IsOptional()
  @IsUUID('4', { message: 'distribuidorId deve ser um UUID válido' })
  distribuidorId?: string;
}
