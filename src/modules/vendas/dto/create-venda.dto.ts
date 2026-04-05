import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrigemParticipacao, TipoPagamento } from '@prisma/client';

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

  @ApiProperty({
    enum: TipoPagamento,
    example: TipoPagamento.PIX,
    description: 'Método de pagamento: PIX ou CARTAO.',
  })
  @IsEnum(TipoPagamento)
  tipoPagamento: TipoPagamento;

  @ApiPropertyOptional({
    enum: OrigemParticipacao,
    example: OrigemParticipacao.DIGITAL,
    description: 'Origem da participação. Default: DIGITAL.',
  })
  @IsOptional()
  @IsEnum(OrigemParticipacao)
  origemParticipacao?: OrigemParticipacao;

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
