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

@ApiTags('Admin / Relatórios - Vendedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/relatorios/vendedores')
export class RelatoriosVendedoresController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('xlsx')
  @ApiOperation({ summary: 'Exportar relatório de vendedores em XLSX' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  @ApiQuery({ name: 'distribuidor', required: false })
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['nome', 'createdAt', 'codigo', 'totalClientes'],
  })
  async exportarXlsx(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('distribuidor') distribuidor?: string,
    @Query('ordenarPor') ordenarPor?: string,
  ) {
    return this.relatoriosService.exportarVendedoresXlsx(res, {
      dataInicio,
      dataFim,
      distribuidor,
      ordenarPor,
    });
  }

  @Get('pdf')
  @ApiOperation({ summary: 'Exportar relatório de vendedores em PDF' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  @ApiQuery({ name: 'distribuidor', required: false })
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['nome', 'createdAt', 'codigo', 'totalClientes'],
  })
  async exportarPdf(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('distribuidor') distribuidor?: string,
    @Query('ordenarPor') ordenarPor?: string,
  ) {
    return this.relatoriosService.exportarVendedoresPdf(res, {
      dataInicio,
      dataFim,
      distribuidor,
      ordenarPor,
    });
  }
}
