import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { StatusVenda } from '@prisma/client';
import { parseCampoOpcionalVazio } from './filtro-relatorio-vendas.dto';

export class FiltroRelatorioVendasCdpDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID da edição.',
  })
  @IsUUID('4')
  edicaoId!: string;

  @ApiPropertyOptional({
    enum: StatusVenda,
    example: StatusVenda.APROVADO,
    description:
      'Filtra por status da venda. Sem ele, o arquivo sai com as APROVADAS — ' +
      'o padrão da prestação de contas do parceiro.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsEnum(StatusVenda)
  status?: StatusVenda;
}
