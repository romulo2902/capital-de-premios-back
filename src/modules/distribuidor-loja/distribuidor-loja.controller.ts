import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { DistribuidorLojaService } from './distribuidor-loja.service';
import { CreateVendedorLojaDto, SolicitarSaqueLojaDto } from './dto/distribuidor-loja.dto';
import { ForbiddenException } from '@nestjs/common';

@ApiTags('Loja / Distribuidor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DISTRIBUIDOR')
@Controller('distribuidor')
export class DistribuidorLojaController {
  constructor(private readonly service: DistribuidorLojaService) {}

  private getDistribuidorId(user: RequestUser): string {
    if (!user.distribuidorId) throw new ForbiddenException('Perfil de distribuidor não encontrado');
    return user.distribuidorId;
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────
  @Get('perfil')
  @ApiOperation({ summary: 'Ver próprio perfil (DISTRIBUIDOR)' })
  getPerfil(@CurrentUser() user: RequestUser) {
    return this.service.getPerfil(this.getDistribuidorId(user));
  }

  // ─── Vendedores (RF-D03) ──────────────────────────────────────────────────
  @Get('vendedores')
  @ApiOperation({ summary: 'Listar próprios vendedores (DISTRIBUIDOR — RF-D03)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getVendedores(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.getVendedores(this.getDistribuidorId(user), {
      page: +page,
      limit: +limit,
    });
  }

  @Post('vendedores')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastrar novo vendedor vinculado (DISTRIBUIDOR — RF-D03)' })
  createVendedor(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateVendedorLojaDto,
  ) {
    return this.service.createVendedor(this.getDistribuidorId(user), dto);
  }

  // ─── Vendas (RF-D01, RF-D02, RF-D04) ─────────────────────────────────────
  @Get('vendas')
  @ApiOperation({ summary: 'Listar vendas próprias + dos vendedores vinculados (DISTRIBUIDOR — RF-D02/D04)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO'], description: 'Filtro por etapa/status (RF-D04)' })
  getVendas(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.service.getVendas(this.getDistribuidorId(user), { page: +page, limit: +limit, status });
  }

  // ─── Relatório Performance (RF-D05) ──────────────────────────────────────
  @Get('relatorios/performance')
  @ApiOperation({ summary: 'Relatório de performance por etapa por vendedor (DISTRIBUIDOR — RF-D05)' })
  getPerformance(@CurrentUser() user: RequestUser) {
    return this.service.getPerformancePorEtapa(this.getDistribuidorId(user));
  }

  // ─── Saques ───────────────────────────────────────────────────────────────
  @Get('saques')
  @ApiOperation({ summary: 'Histórico de saques do distribuidor (DISTRIBUIDOR)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getSaques(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.getSaques(this.getDistribuidorId(user), {
      page: +page,
      limit: +limit,
    });
  }

  @Post('saques')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Solicitar saque de comissão (DISTRIBUIDOR)' })
  criarSaque(
    @CurrentUser() user: RequestUser,
    @Body() dto: SolicitarSaqueLojaDto,
  ) {
    return this.service.criarSaque(this.getDistribuidorId(user), dto.valor);
  }
}
