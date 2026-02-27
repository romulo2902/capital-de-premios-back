import { IsNumber, IsPositive, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SolicitarSaqueVendedorDto {
  @ApiProperty({ example: 100.00, description: 'Valor do saque solicitado em reais' })
  @IsNumber()
  @IsPositive()
  valor: number;
}
