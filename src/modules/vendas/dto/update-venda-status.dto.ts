import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatusVenda } from '@prisma/client';

export class UpdateVendaStatusDto {
  @ApiProperty({
    enum: StatusVenda,
    example: StatusVenda.CANCELADO,
    description: 'Novo status da venda.',
  })
  @IsEnum(StatusVenda, { message: 'status inválido' })
  status: StatusVenda;

  @ApiPropertyOptional({
    example: 'Cliente solicitou cancelamento',
    description: 'Motivo da alteração de status (obrigatório para cancelamento).',
  })
  @IsOptional()
  @IsString({ message: 'motivo deve ser um texto' })
  motivo?: string;
}
