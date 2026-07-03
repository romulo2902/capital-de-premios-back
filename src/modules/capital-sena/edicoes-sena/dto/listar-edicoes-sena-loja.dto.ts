import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { StatusEdicaoSena } from '@prisma/client';
import { PaginationQueryDto } from '../../../../common/dto/pagination-query.dto';

export const STATUS_EDICAO_SENA_LOJA = [
  StatusEdicaoSena.ATIVA,
  StatusEdicaoSena.ENCERRADA,
  StatusEdicaoSena.APURANDO,
  StatusEdicaoSena.FINALIZADA,
] as const;

export type StatusEdicaoSenaLoja = (typeof STATUS_EDICAO_SENA_LOJA)[number];

export class ListarEdicoesSenaLojaDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: STATUS_EDICAO_SENA_LOJA,
    example: StatusEdicaoSena.ATIVA,
    description:
      'Status público da edição. Quando omitido, lista somente edições ATIVAS para compra.',
  })
  @IsOptional()
  @IsIn(STATUS_EDICAO_SENA_LOJA)
  status?: StatusEdicaoSenaLoja;
}
