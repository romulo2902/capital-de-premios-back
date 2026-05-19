import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  IsEmail,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Max,
} from 'class-validator';
import { TipoCartela } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ComboSelecionadoLojaDto } from './combo-selecionado-loja.dto';
import { IsCpfValido } from '../../../common/validators/cpf.validator';

const emptyStringToUndefined = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
};

export class ComprarLojaDto {
  @ApiProperty({ example: 'uuid-da-edicao', description: 'ID da edição' })
  @IsUUID('4')
  edicaoId: string;

  @ApiProperty({ example: 30.0, description: 'Valor total da compra' })
  @Type(() => Number)
  @Min(0)
  valor: number;

  @ApiProperty({
    example: 1,
    description:
      'Quantidade de itens sendo comprados (ex: quantidade de combos ou quantidade de cartelas avulsas)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidadeCartelas: number;

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
      'Números base selecionados explicitamente pelo cliente (apenas para compras unitárias)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cartelasSelecionadas?: string[];

  @ApiProperty({ example: '12345678900', description: 'CPF do cliente' })
  @IsString()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
  @IsCpfValido({ message: 'CPF inválido' })
  cpf: string;

  @ApiProperty({ example: 'João da Silva', description: 'Nome do cliente' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  nome: string;

  @ApiProperty({
    example: '(61) 99999-9999',
    description: 'Telefone do cliente',
  })
  @IsString()
  @IsNotEmpty()
  telefone: string;

  @ApiPropertyOptional({
    example: 'joao@email.com',
    description: 'Email do cliente (opcional). String vazia é ignorada.',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({
    example: '1990-01-01',
    description:
      'Data de nascimento do cliente no formato YYYY-MM-DD. Obrigatória para validar maioridade.',
  })
  @Transform(emptyStringToUndefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataNascimento deve estar no formato YYYY-MM-DD',
  })
  dataNascimento: string;

  @ApiPropertyOptional({
    example: 'cfda6bc8-665d-4735-a217-3f51775d431c',
    description:
      'ID do usuário vendedor/distribuidor recebido pela URL da loja (?seller_id=...).',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsUUID('4')
  seller_id?: string;
}
