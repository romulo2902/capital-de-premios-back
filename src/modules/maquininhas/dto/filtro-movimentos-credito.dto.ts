import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoMovimentoCredito } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Filtros do extrato de crédito de uma maquininha. */
export class FiltroMovimentosCreditoDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TipoMovimentoCredito,
    example: TipoMovimentoCredito.CONSUMO,
    description:
      'Filtrar por tipo de movimento (RECARGA, CONSUMO, ESTORNO, AJUSTE_CREDITO, AJUSTE_DEBITO).',
  })
  @IsOptional()
  @IsEnum(TipoMovimentoCredito)
  tipo?: TipoMovimentoCredito;

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
