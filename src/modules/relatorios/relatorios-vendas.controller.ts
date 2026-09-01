import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
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

  @Get('cdp')
  @ApiOperation({
    summary:
      'Exportar relatório CDP de vendas (arquivo TXT) por edição (ADMIN)',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description:
      'Arquivo TXT com nome capital_de_premios_YYYYMMDD.txt enviado via Content-Disposition.',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiQuery({
    name: 'edicaoId',
    required: true,
    description: 'ID da edição',
  })
  async exportarCDP(
    @Res() res: Response,
    @Query('edicaoId') edicaoId: string,
  ) {
    return this.relatoriosService.exportarRelatorioCDP(res, edicaoId);
  }

  @Get('sena')
  @ApiOperation({
    summary:
      'Exportar relatório Sena de vendas (arquivo TXT) por edição (ADMIN)',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description:
      'Arquivo TXT com nome capital_sena_YYYYMMDD.txt enviado via Content-Disposition.',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiQuery({
    name: 'edicaoSenaId',
    required: true,
    description: 'ID da edição Sena',
  })
  @ApiQuery({
    name: 'dataInicio',
    required: false,
    description: 'Data início do período no cabeçalho (YYYY-MM-DD). Padrão: hoje.',
    example: '2026-06-09',
  })
  @ApiQuery({
    name: 'dataFim',
    required: false,
    description: 'Data fim do período no cabeçalho (YYYY-MM-DD). Padrão: hoje.',
    example: '2026-06-09',
  })
  async exportarSena(
    @Res() res: Response,
    @Query('edicaoSenaId') edicaoSenaId: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.relatoriosService.exportarRelatorioSena(
      res,
      edicaoSenaId,
      dataInicio,
      dataFim,
    );
  }

  @Get('sena/xlsx')
  @ApiOperation({
    summary: 'Exportar relatório de vendas do Capital Sena em XLSX (ADMIN)',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiQuery({
    name: 'edicaoSenaId',
    required: false,
    description: 'Filtra por edição Sena. Sem ele, traz todas as edições.',
  })
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
  async exportarSenaXlsx(
    @Res() res: Response,
    @Query('edicaoSenaId') edicaoSenaId?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.relatoriosService.exportarVendasSenaXlsx(res, {
      edicaoSenaId,
      dataInicio,
      dataFim,
    });
  }

  @Get('sena/ganhadores')
  @ApiOperation({
    summary:
      'Exportar relatório de ganhadores do Sena (arquivo TXT) por edição, agrupado por prêmio (ADMIN)',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description:
      'Arquivo TXT com nome ganhadores_sena_{numeroEdicao}_YYYYMMDD.txt enviado via Content-Disposition. ' +
      'Agrupa ganhadores por prêmio (Bola Extra, Sena, Quina, Quadra), trazendo nome, telefone, CPF, e-mail, ' +
      'onde comprou (POS, WhatsApp ou Digital) e nome do vendedor (quando houver).',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiQuery({
    name: 'edicaoSenaId',
    required: true,
    description: 'ID da edição Sena',
  })
  async exportarGanhadoresSena(
    @Res() res: Response,
    @Query('edicaoSenaId') edicaoSenaId: string,
  ) {
    return this.relatoriosService.exportarRelatorioGanhadoresSena(
      res,
      edicaoSenaId,
    );
  }

  @Get('sena/ganhadores/xlsx')
  @ApiOperation({
    summary:
      'Exportar relatório de ganhadores do Sena em XLSX por edição (ADMIN)',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({
    description:
      'Planilha ganhadores_sena_{numeroEdicao}_YYYYMMDD.xlsx com uma linha por ganhador ' +
      '(coluna Prêmio identifica a faixa: Bola Extra, Sena, Quina ou Quadra). ' +
      'Faixa sem ganhador simplesmente não gera linha.',
  })
  @ApiQuery({
    name: 'edicaoSenaId',
    required: true,
    description: 'ID da edição Sena',
  })
  async exportarGanhadoresSenaXlsx(
    @Res() res: Response,
    @Query('edicaoSenaId') edicaoSenaId: string,
  ) {
    return this.relatoriosService.exportarGanhadoresSenaXlsx(res, edicaoSenaId);
  }
}
