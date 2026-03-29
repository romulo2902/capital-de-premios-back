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

@ApiTags('Admin / Relatórios - Distribuidores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/relatorios/distribuidores')
export class RelatoriosDistribuidoresController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('xlsx')
  @ApiOperation({ summary: 'Exportar relatório de distribuidores em XLSX' })
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
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['distribuidores'],
    description: 'Ordenação disponível no admin para este relatório.',
  })
  async exportarXlsx(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('ordenarPor') ordenarPor?: string,
  ) {
    return this.relatoriosService.exportarDistribuidoresXlsx(res, {
      dataInicio,
      dataFim,
      ordenarPor,
    });
  }

  @Get('pdf')
  @ApiOperation({ summary: 'Exportar relatório de distribuidores em PDF' })
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
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['distribuidores'],
    description: 'Ordenação disponível no admin para este relatório.',
  })
  async exportarPdf(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('ordenarPor') ordenarPor?: string,
  ) {
    return this.relatoriosService.exportarDistribuidoresPdf(res, {
      dataInicio,
      dataFim,
      ordenarPor,
    });
  }
}
