import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { StatusVendaSena } from '@prisma/client';
import { parseCampoOpcionalVazio } from './filtro-relatorio-vendas.dto';

export class FiltroRelatorioVendasSenaDto {
  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Início do período. Use ISO, preferencialmente YYYY-MM-DD.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsString()
  dataInicio?: string;

  @ApiPropertyOptional({
    example: '2026-03-31',
    description: 'Fim do período. Use ISO, preferencialmente YYYY-MM-DD.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsString()
  dataFim?: string;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Filtra por edição Sena. Sem ele, traz todas as edições.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsUUID('4')
  edicaoSenaId?: string;

  @ApiPropertyOptional({
    enum: StatusVendaSena,
    example: StatusVendaSena.APROVADO,
    description:
      'Filtra por status da venda. Sem ele, a planilha traz todos os status.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsEnum(StatusVendaSena)
  status?: StatusVendaSena;
}
