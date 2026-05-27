import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
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
import {
  ModoSelecaoSena,
  OrigemParticipacao,
  TipoPagamento,
} from '@prisma/client';

export class ItemCartelaSenaDto {
  @ApiPropertyOptional({
    type: [Number],
    example: [3, 12, 24, 37, 45, 58],
    description:
      '6 números escolhidos (1–60). Obrigatório se modoSelecao=MANUAL. Omita para SURPRESINHA.',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(60, { each: true })
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  numeros?: number[];

  @ApiProperty({ enum: ModoSelecaoSena, example: ModoSelecaoSena.MANUAL })
  @IsEnum(ModoSelecaoSena)
  modoSelecao: ModoSelecaoSena;
}

export class CreateVendaSenaDto {
  @ApiProperty({ example: 'uuid-da-edicao-sena' })
  @IsUUID('4')
  edicaoSenaId: string;

  @ApiProperty({
    type: [ItemCartelaSenaDto],
    description:
      'Lista de cartelas a comprar. Use junto com cartelas individuais.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemCartelaSenaDto)
  @ArrayMinSize(1)
  cartelas: ItemCartelaSenaDto[];

  @ApiPropertyOptional({ example: 'uuid-do-combo' })
  @IsOptional()
  @IsUUID('4')
  comboSenaId?: string;

  @ApiProperty({ enum: TipoPagamento, example: TipoPagamento.PIX })
  @IsEnum(TipoPagamento)
  tipoPagamento: TipoPagamento;

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

  // Dados do cliente
  @ApiProperty({ example: '12345678900' })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @MinLength(2)
  nome: string;

  @ApiProperty({ example: '(11) 99999-9999' })
  @IsString()
  telefone: string;

  @ApiPropertyOptional({ example: 'maria@email.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

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

  // Origem da venda
  @ApiPropertyOptional({ example: 'uuid-do-vendedor' })
  @IsOptional()
  @IsUUID('4')
  vendedorId?: string;

  @ApiPropertyOptional({ example: 'uuid-do-distribuidor' })
  @IsOptional()
  @IsUUID('4')
  distribuidorId?: string;

  @ApiPropertyOptional({
    example: 'cfda6bc8-665d-4735-a217-3f51775d431c',
    description:
      'ID do usuário vendedor/distribuidor recebido pela URL da loja (?seller_id=...).',
  })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsUUID('4')
  seller_id?: string;
}
