import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardFilterDto } from './dto/filtro-dashboard.dto';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiBearerAuth()
@ApiTags('Admin / Dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ─── ADMIN ──────────────────────────────────────────────────

  @Get('visao-geral')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Visão geral com totais do sistema (ADMIN)',
    description: 'Endpoint de uso exclusivo do Admin. Retorna contadores globais sem qualquer limite de rede ou hierarquia.'
  })
  getAdminVisaoGeral() {
    return this.dashboardService.getAdminVisaoGeral();
  }

  @Get('vendas-por-edicao')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Faturamento agregado por edição (ADMIN)' })
  getAdminVendasPorEdicao() {
    return this.dashboardService.getAdminVendasPorEdicao();
  }

  @Get('analise')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Análise de vendas combinadas e timeline diária (ADMIN)' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  getAdminAnaliseTimeline(@Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getAdminAnaliseTimeline(filtros);
  }

  @Get('edicoes')
  @Roles('DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({
    summary: 'Listar edições disponíveis para filtro do dashboard',
    description:
      'Retorna somente id, número, nome, status e datas das edições com vendas aprovadas vinculadas ao usuário autenticado.',
  })
  getEdicoesDisponiveis(@Req() req: { user: RequestUser }) {
    return this.dashboardService.getEdicoesDisponiveis(req.user);
  }

  // ─── DISTRIBUIDOR ──────────────────────────────────────────

  @Get('distribuidor/timeline-vendas')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Vendas diárias agregadas da equipe (DISTRIBUIDOR)',
    description: 'Retorna a timeline de vendas (somas diárias) estritamente limitadas às vendas que foram originadas pela rede de vendedores deste distribuidor logado.'
  })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getDistribuidorTimeline(@Req() req: any, @Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getDistribuidorTimeline(req.user, filtros);
  }

  @Get('distribuidor/vendas-por-vendedor')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({ summary: 'Quantidade total em valor/cartelas por vendedor da equipe' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getDistribuidorVendasPorVendedor(
    @Req() req: any,
    @Query() filtros: DashboardFilterDto,
  ) {
    return this.dashboardService.getDistribuidorVendasPorVendedor(
      req.user,
      filtros,
    );
  }

  @Get('distribuidor/clientes-por-vendedor')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({ summary: 'Total de clientes captados organizados por vendedor' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getDistribuidorClientesPorVendedor(
    @Req() req: any,
    @Query() filtros: DashboardFilterDto,
  ) {
    return this.dashboardService.getDistribuidorClientesPorVendedor(
      req.user,
      filtros,
    );
  }

  @Get('distribuidor/comissoes')
  @Roles('DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Comissões líquidas adquiridas pelo Distribuidor',
    description: 'Soma o dinheiro ganho pelo Distribuidor (Spread). Retorna os lucros com base na sobra percentual da sua rede transacionada na ComissaoDistribuidor, respeitando seu perfil Auth.'
  })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getDistribuidorComissoes(@Req() req: any, @Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getDistribuidorComissoes(req.user, filtros);
  }

  // ─── VENDEDOR ──────────────────────────────────────────────

  @Get('vendedor/timeline-vendas')
  @Roles('VENDEDOR')
  @ApiOperation({
    summary: 'Vendas diárias acumuladas do próprio vendedor (VENDEDOR)',
    description: 'Apresenta as vendas filtradas cirurgicamente e conectadas ao vendedor logado via JWT. Bloqueia dados de outros vendedores e da hierarquia superior.'
  })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getVendedorTimeline(@Req() req: any, @Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getVendedorTimeline(req.user, filtros);
  }

  @Get('vendedor/clientes')
  @Roles('VENDEDOR')
  @ApiOperation({ summary: 'Total de clientes deste vendedor' })
  @ApiQuery({ name: 'edicaoIds', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  getVendedorTotalClientes(@Req() req: any, @Query() filtros: DashboardFilterDto) {
    return this.dashboardService.getVendedorTotalClientes(req.user, filtros);
  }
}
