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

  @ApiHideProperty()
  @IsOptional()
  @IsEnum(TipoCartela)
  tipoCartela?: TipoCartela;

  @ApiPropertyOptional({
    example: 6,
    description:
      'Quantidade de cartelas do combo (inteiro de 1 a 12). Se omitida, assume 1.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  quantidadeCartelas?: number;

  @ApiProperty({ example: 1, description: 'Quantidade de opções deste tipo' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade: number;

  @ApiPropertyOptional({
    type: [ComboSelecionadoLojaDto],
    description:
      'Combos escolhidos explicitamente pelo cliente. Quando informado, a compra aprova exatamente esses combos e não uma nova alocação automática.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboSelecionadoLojaDto)
  combosSelecionados?: ComboSelecionadoLojaDto[];

  @ApiProperty({ example: '12345678900', description: 'CPF do cliente' })
  @IsString()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido' })
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

  @ApiPropertyOptional({
    example: '1990-01-01',
    description:
      'Data de nascimento do cliente (opcional). String vazia é ignorada.',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  dataNascimento?: string;
}
