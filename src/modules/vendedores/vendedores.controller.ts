import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VendedoresService } from './vendedores.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';
import { FiltroPerformanceDto } from './dto/filtro-performance.dto';
import { FiltroVendedoresDto } from './dto/filtro-vendedores.dto';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Admin / Vendedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/vendedores')
export class VendedoresController {
  constructor(private readonly vendedoresService: VendedoresService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar vendedor (ADMIN)' })
  create(@Body() dto: CreateVendedorDto) {
    return this.vendedoresService.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Listar vendedores' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'distribuidorId', required: false, type: String })
  findAll(
    @Query() filtros: FiltroVendedoresDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.findAll(
      filtros.page,
      filtros.limit,
      filtros.search,
      filtros.distribuidorId,
      user,
    );
  }

  @Get('performance')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Performance de vendas dos vendedores — Top 10 + listagem (ADMIN)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoId', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  performanceVendas(@Query() filtros: FiltroPerformanceDto) {
    return this.vendedoresService.performanceVendas(
      filtros.page,
      filtros.limit,
      filtros,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar vendedor por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.findOne(id, user);
  }

  @Get('codigo/:codigo')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar vendedor por código sequencial' })
  findByCodigo(
    @Param('codigo', ParseIntPipe) codigo: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.findByCodigo(codigo, user);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar vendedor (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendedorDto,
  ) {
    return this.vendedoresService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Inativar vendedor' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendedoresService.remove(id);
  }
}
