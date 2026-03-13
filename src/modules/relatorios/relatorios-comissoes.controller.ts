import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RelatoriosService } from './relatorios.service';

@ApiTags('Admin / Relatórios - Comissões')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/relatorios/comissoes')
export class RelatoriosComissoesController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get('pdf')
  @ApiOperation({ summary: 'Exportar relatório de comissões em PDF' })
  async exportarPdf(@Res() res: Response) {
    return this.relatoriosService.exportarComissoesPdf(res);
  }
}
