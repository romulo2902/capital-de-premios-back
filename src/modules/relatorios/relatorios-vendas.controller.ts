import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RelatoriosService } from './relatorios.service';

@ApiTags('Admin / Relatórios - Vendas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/relatorios/vendas')
export class RelatoriosVendasController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('xlsx')
  @ApiOperation({ summary: 'Exportar relatório de vendas em XLSX' })
  @ApiQuery({
    name: 'dataInicio',
    required: false,
    description: 'Use ISO, preferencialmente YYYY-MM-DD.',
    example: '2026-03-01',
  })
  @ApiQuery({
    name: 'dataFim',
    required: false,
    description: 'Use ISO, preferencialmente YYYY-MM-DD.',
    example: '2026-03-31',
  })
  @ApiQuery({ name: 'edicaoId', required: false })
  async exportarXlsx(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('edicaoId') edicaoId?: string,
  ) {
    return this.relatoriosService.exportarVendasXlsx(res, {
      dataInicio,
      dataFim,
      edicaoId,
    });
  }
}
