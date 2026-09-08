import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { StatusVenda } from '@prisma/client';

/**
 * Campo de filtro em branco no painel chega como `''` na query string. Sem
 * isso, limpar o campo passaria a devolver 400 em vez de "sem filtro".
 */
export const parseCampoOpcionalVazio = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class FiltroRelatorioVendasDto {
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
    description: 'Filtra por edição. Sem ele, traz todas as edições.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsUUID('4')
  edicaoId?: string;

  @ApiPropertyOptional({
    enum: StatusVenda,
    example: StatusVenda.APROVADO,
    description:
      'Filtra por status da venda. Sem ele, a planilha traz todos os status.',
  })
  @IsOptional()
  @Transform(parseCampoOpcionalVazio)
  @IsEnum(StatusVenda)
  status?: StatusVenda;
}
