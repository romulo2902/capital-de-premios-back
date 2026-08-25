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
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';
import { aplicarVinculoDoToken } from '../../../common/utils/vinculo-cliente.util';
import { VendasSenaService } from './vendas-sena.service';
import { CreateVendaSenaDto } from './dto/create-venda-sena.dto';
import { FiltroVendasSenaDto } from './dto/filtro-vendas-sena.dto';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@ApiTags('Sena Admin / Vendas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/capital-sena/vendas')
export class VendasSenaController {
  constructor(private readonly vendasSenaService: VendasSenaService) {}

  @Post()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({
    summary:
      'Criar venda Sena — recebe `numeros` do frontend com 6 números + bola extra (ADMIN=aprova direto, DISTRIBUIDOR/VENDEDOR=gateway)',
    description:
      'O vínculo comercial vem do token, não do corpo. VENDEDOR: `vendedorId` é ' +
      'forçado ao do token e `distribuidorId` do corpo é ignorado. DISTRIBUIDOR: ' +
      '`distribuidorId` é forçado ao do token e `vendedorId` só é aceito se o ' +
      'vendedor pertencer à sua rede (senão 403). `seller_id` é ignorado para ' +
      'ambos — é o mecanismo da loja pública. ADMIN informa tudo livremente.',
  })
  create(@Body() dto: CreateVendaSenaDto, @CurrentUser() user: RequestUser) {
    aplicarVinculoDoToken(dto, user);
    return this.vendasSenaService.create(dto, user);
  }

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar vendas Sena com filtros' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoSenaId', required: false })
  @ApiQuery({ name: 'clienteId', required: false })
  @ApiQuery({ name: 'vendedorId', required: false })
  @ApiQuery({ name: 'distribuidorId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO'],
  })
  @ApiQuery({ name: 'cpf', required: false })
  findAll(@Query() filtros: FiltroVendasSenaDto) {
    return this.vendasSenaService.findAll(filtros);
  }

  @Get('cliente/:cpf')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar vendas Sena de um cliente por CPF' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findByCliente(
    @Param('cpf') cpf: string,
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.vendasSenaService.findByCliente(
      cpf,
      pagination.page,
      pagination.limit,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Detalhar venda Sena' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendasSenaService.findOne(id);
  }

  @Patch(':id/cancelar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Cancelar venda Sena (ADMIN)' })
  cancelar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('motivo') motivo?: string,
  ) {
    return this.vendasSenaService.cancelar(id, motivo);
  }
}
