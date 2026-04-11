import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';
import { TipoCartela } from '@prisma/client';
import { Type } from 'class-transformer';
import { ComboSelecionadoLojaDto } from './combo-selecionado-loja.dto';

export class ComprarLojaDto {
  @ApiProperty({ example: 'uuid-da-edicao', description: 'ID da edição' })
  @IsUUID('4')
  edicaoId: string;

  @ApiProperty({ enum: TipoCartela, example: TipoCartela.SEIS_CHANCES, description: 'Tipo de cartela escolhido' })
  @IsEnum(TipoCartela)
  tipoCartela: TipoCartela;

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

  @ApiProperty({ example: '(61) 99999-9999', description: 'Telefone do cliente' })
  @IsString()
  @IsNotEmpty()
  telefone: string;

  @ApiPropertyOptional({ example: 'joao@email.com', description: 'Email do cliente' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '1990-01-01', description: 'Data de nascimento do cliente' })
  @IsOptional()
  @IsString()
  dataNascimento?: string;
}
