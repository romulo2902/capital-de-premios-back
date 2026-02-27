import { IsString, IsEmail, IsNumber, Min, IsOptional, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVendedorLojaDto {
  @ApiProperty({ example: 'João da Silva', description: 'Nome completo do vendedor' })
  @IsString()
  nome: string;

  @ApiProperty({ example: '123.456.789-00', description: 'CPF do vendedor (formatado ou somente dígitos)' })
  @IsString()
  cpf: string;

  @ApiProperty({ example: 'joao@email.com', description: 'E-mail do vendedor (será usado para login)' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '11999990000', description: 'Telefone do vendedor' })
  @IsString()
  telefone: string;

  @ApiPropertyOptional({ example: 10, description: 'Percentual de comissão do vendedor (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  comissaoPercent?: number;

  @ApiProperty({ example: 'Senha@123', description: 'Senha de acesso do vendedor na loja' })
  @IsString()
  senha: string;
}

export class SolicitarSaqueLojaDto {
  @ApiProperty({ example: 150.00, description: 'Valor do saque solicitado em reais' })
  @IsNumber()
  @IsPositive()
  valor: number;
}
