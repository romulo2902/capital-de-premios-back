import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusVenda } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Produto vendido no terminal. */
export enum TipoVendaPos {
  CDP = 'CDP',
  SENA = 'SENA',
}

/** Filtros do histórico de vendas de uma maquininha. */
export class FiltroPosVendasMaquininhaDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TipoVendaPos,
    example: TipoVendaPos.CDP,
    description:
      'Filtrar por produto. Sem ele, a lista traz Capital de Prêmios e Capital Sena juntos.',
  })
  @IsOptional()
  @IsEnum(TipoVendaPos)
  tipo?: TipoVendaPos;

  @ApiPropertyOptional({
    enum: StatusVenda,
    example: StatusVenda.APROVADO,
    description:
      'Filtrar por status da venda. Vale para os dois produtos — `StatusVenda` e ' +
      '`StatusVendaSena` têm os mesmos valores.',
  })
  @IsOptional()
  @IsEnum(StatusVenda)
  status?: StatusVenda;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Início do período, em ISO 8601.',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'dataInicio deve ser uma data válida no formato ISO 8601' },
  )
  dataInicio?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59.999Z',
    description: 'Fim do período, em ISO 8601.',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'dataFim deve ser uma data válida no formato ISO 8601' },
  )
  dataFim?: string;
}
