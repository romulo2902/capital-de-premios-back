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
  @Min(0)
  valor?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Quantidade de itens sendo comprados (ex: quantidade de combos ou quantidade de cartelas avulsas). O campo legado quantidade também é aceito.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  quantidadeCartelas?: number;

  @ApiHideProperty()
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  quantidade?: number;

  @ApiPropertyOptional({
    example: 'uuid-do-combo',
    description: 'ID do combo (se for uma compra de combo)',
  })
  @IsOptional()
  @IsUUID('4')
  comboId?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Números base selecionados explicitamente pelo vendedor/cliente (apenas para compras unitárias)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cartelasSelecionadas?: string[];

  @ApiPropertyOptional({
    enum: TipoPagamento,
    example: TipoPagamento.MANUAL,
    description:
      'Método de pagamento. Em venda direta do ADMIN pode ser omitido, pois a API força `MANUAL` automaticamente; demais perfis devem informar `PIX` ou `CARTAO`.',
  })
  @IsOptional()
  @IsEnum(TipoPagamento)
  tipoPagamento?: TipoPagamento;

  @ApiPropertyOptional({
    enum: [OrigemParticipacao.DIGITAL],
    example: OrigemParticipacao.DIGITAL,
    description:
      'Origem da participação. Default: DIGITAL. Vendas POS possuem canal próprio em /pos.',
  })
  @IsOptional()
  @IsEnum(OrigemParticipacao)
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
  @IsArray()
  @IsString({ each: true })
  combosSelecionados?: string[];

  // --- Dados do cliente (auto-cadastro ou lookup) ---

  @ApiProperty({
    example: '12345678900',
    description: 'CPF do cliente (somente números, 11 dígitos).',
  })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({
    example: 'Romulo Valadares',
    description: 'Nome completo do cliente.',
  })
  @IsString()
  @MinLength(2)
  nome: string;

  @ApiProperty({
    example: '(00) 99999-9999',
    description: 'Telefone do cliente com DDD.',
  })
  @IsString()
  telefone: string;

  @ApiProperty({
    example: 'romulo.valadares@email.com',
    description: 'E-mail do cliente. Obrigatório para envio do comprovante de compra.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: '1985-04-11',
    description:
      'Data de nascimento do cliente no formato YYYY-MM-DD. Obrigatória para validar maioridade.',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataNascimento deve estar no formato YYYY-MM-DD',
  })
  dataNascimento: string;

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
