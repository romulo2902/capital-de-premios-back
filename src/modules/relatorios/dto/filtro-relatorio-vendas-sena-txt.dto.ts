import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { StatusVendaSena } from '@prisma/client';
import { parseCampoOpcionalVazio } from './filtro-relatorio-vendas.dto';

export class FiltroRelatorioVendasSenaTxtDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'ID da edição Sena.',
  })
  @IsUUID('4')
  edicaoSenaId!: string;

  @ApiPropertyOptional({
    example: '2026-06-09',
    description:
      'Data início do período no cabeçalho (YYYY-MM-DD). Padrão: hoje.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsString()
  dataInicio?: string;

  @ApiPropertyOptional({
    example: '2026-06-09',
    description: 'Data fim do período no cabeçalho (YYYY-MM-DD). Padrão: hoje.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsString()
  dataFim?: string;

  @ApiPropertyOptional({
    enum: StatusVendaSena,
    example: StatusVendaSena.APROVADO,
    description:
      'Filtra por status da venda. Sem ele, o arquivo sai com as APROVADAS — ' +
      'o padrão da prestação de contas do parceiro.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsEnum(StatusVendaSena)
  status?: StatusVendaSena;
}
