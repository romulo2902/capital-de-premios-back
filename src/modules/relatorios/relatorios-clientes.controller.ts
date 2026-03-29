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
  @ApiQuery({
    name: 'dataInicio',
    required: false,
    description: 'Cadastro de clientes a partir desta data. Use ISO, preferencialmente YYYY-MM-DD.',
    example: '2026-03-01',
  })
  @ApiQuery({
    name: 'dataFim',
    required: false,
    description: 'Cadastro de clientes até esta data. Use ISO, preferencialmente YYYY-MM-DD.',
    example: '2026-03-31',
  })
  @ApiQuery({
    name: 'vendedor',
    required: false,
    description: 'Busca por nome ou CPF do vendedor.',
    example: 'Nome, CPF',
  })
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['maisRecente', 'maisAntigo'],
    description: 'Ordenação disponível no admin para este relatório.',
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
  @ApiQuery({
    name: 'dataInicio',
    required: false,
    description: 'Cadastro de clientes a partir desta data. Use ISO, preferencialmente YYYY-MM-DD.',
    example: '2026-03-01',
  })
  @ApiQuery({
    name: 'dataFim',
    required: false,
    description: 'Cadastro de clientes até esta data. Use ISO, preferencialmente YYYY-MM-DD.',
    example: '2026-03-31',
  })
  @ApiQuery({
    name: 'vendedor',
    required: false,
    description: 'Busca por nome ou CPF do vendedor.',
    example: 'Nome, CPF',
  })
  @ApiQuery({
    name: 'ordenarPor',
    required: false,
    enum: ['maisRecente', 'maisAntigo'],
    description: 'Ordenação disponível no admin para este relatório.',
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
