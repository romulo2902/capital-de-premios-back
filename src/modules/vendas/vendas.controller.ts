import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { VendasService } from './vendas.service';
import { CreateVendaDto } from './dto/create-venda.dto';
import { UpdateVendaStatusDto } from './dto/update-venda-status.dto';
import { FiltroVendasDto } from './dto/filtro-vendas.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ListarCombosAdminDto } from './dto/listar-combos-admin.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/**
 * CRUD de Vendas — Painel Administrativo
 *
 * Rota base: /api/admin/vendas
 *
 *   - POST   /admin/vendas                → Criar venda + iniciar pagamento
 *   - GET    /admin/vendas                → Listar vendas (paginado, com filtros)
 *   - GET    /admin/vendas/:id            → Detalhes da venda (com bilhetes)
 *   - GET    /admin/vendas/cliente/:cpf   → Vendas por CPF do cliente
 *   - PATCH  /admin/vendas/:id/status     → Atualizar status manualmente (ADMIN)
 *   - PATCH  /admin/vendas/:id/cancelar   → Cancelar venda (ADMIN)
 */
@ApiTags('Admin / Vendas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/vendas')
export class VendasController {
  constructor(private readonly vendasService: VendasService) {}

  @Post()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({
    summary: 'Criar venda + iniciar pagamento (ADMIN, DISTRIBUIDOR, VENDEDOR)',
  })
  create(@Body() dto: CreateVendaDto, @CurrentUser() user: RequestUser) {
    if (user.perfil === 'VENDEDOR' && user.vendedorId) {
      dto.vendedorId = user.vendedorId;
    } else if (user.perfil === 'DISTRIBUIDOR' && user.distribuidorId) {
      dto.distribuidorId = user.distribuidorId;
    }
    return this.vendasService.create(dto);
  }

  @Get('edicoes/:edicaoId/combos')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({
    summary: 'Navegar pelos combos disponíveis para venda de uma edição (Admin/Vendedor)',
  })
  listarCombosDisponiveis(
    @Param('edicaoId', ParseUUIDPipe) edicaoId: string,
    @Query() filtros: ListarCombosAdminDto,
  ) {
    return this.vendasService.listarCombosDisponiveis({
      edicaoId,
      ...filtros,
    });
  }

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar vendas com filtros avançados' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoId', required: false, type: String })
  @ApiQuery({ name: 'clienteId', required: false, type: String })
  @ApiQuery({ name: 'vendedorId', required: false, type: String })
  @ApiQuery({ name: 'distribuidorId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO'],
  })
  @ApiQuery({ name: 'tipoPagamento', required: false, enum: ['PIX', 'CARTAO'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  findAll(@Query() filtros: FiltroVendasDto) {
    return this.vendasService.findAll(filtros.page, filtros.limit, filtros);
  }

  @Get('cliente/:cpf')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar vendas de um cliente por CPF' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findByCliente(
    @Param('cpf') cpf: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.vendasService.findByCliente(
      cpf,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Detalhes de uma venda (com bilhetes)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendasService.findOne(id);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar status da venda manualmente (ADMIN)' })
  atualizarStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendaStatusDto,
  ) {
    return this.vendasService.atualizarStatus(id, dto);
  }

  @Patch(':id/cancelar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cancelar venda (ADMIN)' })
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo?: string,
  ) {
    return this.vendasService.cancelar(id, motivo);
  }
}
