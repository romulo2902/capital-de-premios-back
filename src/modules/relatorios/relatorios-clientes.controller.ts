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

@ApiTags('Admin / Relatórios - Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/relatorios/clientes')
export class RelatoriosClientesController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('xlsx')
  @ApiOperation({ summary: 'Exportar relatório de clientes em XLSX' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  @ApiQuery({ name: 'vendedor', required: false })
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['maisRecente', 'maisAntigo'],
  })
  async exportarXlsx(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('vendedor') vendedor?: string,
    @Query('ordenarPor') ordenarPor?: string,
  ) {
    return this.relatoriosService.exportarClientesXlsx(res, {
      dataInicio,
      dataFim,
      vendedor,
      ordenarPor,
    });
  }

  @Get('pdf')
  @ApiOperation({ summary: 'Exportar relatório de clientes em PDF' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  @ApiQuery({ name: 'vendedor', required: false })
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['maisRecente', 'maisAntigo'],
  })
  async exportarPdf(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('vendedor') vendedor?: string,
    @Query('ordenarPor') ordenarPor?: string,
  ) {
    return this.relatoriosService.exportarClientesPdf(res, {
      dataInicio,
      dataFim,
      vendedor,
      ordenarPor,
    });
  }
}
