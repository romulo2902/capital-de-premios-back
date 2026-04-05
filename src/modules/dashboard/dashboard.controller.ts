import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardFilterDto } from './dto/filtro-dashboard.dto';

@ApiBearerAuth()
@ApiTags('Dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ─── ADMIN ──────────────────────────────────────────────────

  @Get('admin/visao-geral')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Visão geral com totais do sistema (ADMIN)' })
  getAdminVisaoGeral() {
    return this.dashboardService.getAdminVisaoGeral();
  }

  @Get('admin/vendas-por-edicao')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Faturamento agregado por edição (ADMIN)' })
  getAdminVendasPorEdicao() {
    return this.dashboardService.getAdminVendasPorEdicao();
  }

  @Get('admin/analise')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Análise de vendas combinadas e timeline diária (ADMIN)' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getAdminAnaliseTimeline(@Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getAdminAnaliseTimeline(filtros);
  }

  // ─── DISTRIBUIDOR ──────────────────────────────────────────

  @Get('distribuidor/timeline-vendas')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({ summary: 'Vendas diárias agregadas da equipe do distribuidor' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getDistribuidorTimeline(@Req() req: any, @Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getDistribuidorTimeline(req.user, filtros);
  }

  @Get('distribuidor/vendas-por-vendedor')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({ summary: 'Quantidade total em valor/cartelas por vendedor da equipe' })
  getDistribuidorVendasPorVendedor(@Req() req: any) {
    return this.dashboardService.getDistribuidorVendasPorVendedor(req.user);
  }

  @Get('distribuidor/clientes-por-vendedor')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({ summary: 'Total de clientes captados organizados por vendedor' })
  getDistribuidorClientesPorVendedor(@Req() req: any) {
    return this.dashboardService.getDistribuidorClientesPorVendedor(req.user);
  }

  @Get('distribuidor/comissoes')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({ summary: 'Valor total agregado (comissões/vendas) no período ou edição' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getDistribuidorComissoes(@Req() req: any, @Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getDistribuidorComissoes(req.user, filtros);
  }

  // ─── VENDEDOR ──────────────────────────────────────────────

  @Get('vendedor/timeline-vendas')
  @Roles('VENDEDOR')
  @ApiOperation({ summary: 'Vendas diárias acumuladas do próprio vendedor' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getVendedorTimeline(@Req() req: any, @Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getVendedorTimeline(req.user, filtros);
  }

  @Get('vendedor/clientes')
  @Roles('VENDEDOR')
  @ApiOperation({ summary: 'Total de clientes deste vendedor' })
  getVendedorTotalClientes(@Req() req: any) {
    return this.dashboardService.getVendedorTotalClientes(req.user);
  }
}
