import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrigemParticipacao, TipoCartela, TipoPagamento } from '@prisma/client';


export class CreateVendaDto {
  @ApiProperty({
    example: 'uuid-da-edicao',
    description: 'ID da edição/sorteio a ser comprada.',
  })
  @IsUUID('4', { message: 'edicaoId deve ser um UUID válido' })
  edicaoId: string;

  @ApiProperty({
    example: 2,
    description: 'Quantidade de cartelas a comprar.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade: number;

  @ApiPropertyOptional({
    enum: TipoCartela,
    example: TipoCartela.UMA_CHANCE,
    description:
      'Tipo de cartela/chances (legado compatível). Quando omitido, a API usa `quantidadeCartelas` ou assume UMA_CHANCE/tier padrão da edição.',
  })
  @IsOptional()
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Quantidade de cartelas/chances por combo (1 a 12). Alias para `tipoCartela`.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  quantidadeCartelas?: number;

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
    enum: [OrigemParticipacao.DIGITAL, OrigemParticipacao.POS],
    example: OrigemParticipacao.DIGITAL,
    description: 'Origem da participação. Default: DIGITAL.',
  })
  @IsOptional()
  @IsEnum(OrigemParticipacao)
  @IsIn([OrigemParticipacao.DIGITAL, OrigemParticipacao.POS], {
    message: 'origemParticipacao aceita apenas DIGITAL ou POS',
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

  @ApiPropertyOptional({
    example: 'romulo.valadares@email.com',
    description: 'E-mail do cliente (opcional).',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

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
