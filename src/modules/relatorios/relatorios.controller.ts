import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { RelatoriosService } from './relatorios.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

const ADMIN = 'ADMIN';


@ApiTags('Relatórios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ADMIN)
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar endpoints de relatórios disponíveis' })
  findAll() {
    return this.relatoriosService.findAll();
  }

  @Get('vendas/xlsx')
  @ApiOperation({ summary: 'Exportar vendas em XLSX (ADMIN)' })
  @ApiQuery({ name: 'dataInicio', required: false })
  @ApiQuery({ name: 'dataFim', required: false })
  @ApiQuery({ name: 'edicaoId', required: false })
  async exportarVendasXlsx(
    @Res() res: Response,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('edicaoId') edicaoId?: string,
  ) {
    return this.relatoriosService.exportarVendasXlsx(res, { dataInicio, dataFim, edicaoId });
  }

  @Get('comissoes/pdf')
  @ApiOperation({ summary: 'Exportar comissões em PDF (ADMIN)' })
  async exportarComissoesPdf(@Res() res: Response) {
    return this.relatoriosService.exportarComissoesPdf(res);
  }
}
