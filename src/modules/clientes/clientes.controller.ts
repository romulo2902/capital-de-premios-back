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
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { FiltroClientesDto } from './dto/filtro-clientes.dto';

/**
 * CRUD de Clientes — Painel Administrativo
 *
 * Rota base: /api/admin/clientes
 *
 * Segue o mesmo padrão de Vendedores e Distribuidores:
 *   - POST   /admin/clientes            → Criar cliente
 *   - GET    /admin/clientes            → Listar clientes (paginado, com filtros)
 *   - GET    /admin/clientes/:id        → Buscar por UUID
 *   - GET    /admin/clientes/codigo/:codigo → Buscar por código sequencial
 *   - GET    /admin/clientes/cpf/:cpf   → Buscar por CPF
 *   - PATCH  /admin/clientes/:id        → Atualizar cliente
 *   - DELETE /admin/clientes/:id        → Inativar cliente (soft delete)
 */
@ApiTags('Admin / Clientes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Post()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Criar cliente (ADMIN, DISTRIBUIDOR ou VENDEDOR)' })
  create(@Body() dto: CreateClienteDto) {
    return this.clientesService.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar clientes (paginado, com filtros)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'vendedorId', required: false, type: String })
  @ApiQuery({ name: 'distribuidorId', required: false, type: String })
  findAll(@Query() filtros: FiltroClientesDto) {
    return this.clientesService.findAll(
      filtros.page,
      filtros.limit,
      filtros.search,
      filtros.vendedorId,
      filtros.distribuidorId,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Buscar cliente por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.findOne(id);
  }

  @Get('codigo/:codigo')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Buscar cliente por código sequencial' })
  findByCodigo(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.clientesService.findByCodigo(codigo);
  }

  @Get('cpf/:cpf')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Buscar cliente por CPF' })
  findByCpf(@Param('cpf') cpf: string) {
    return this.clientesService.findByCpf(cpf);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Atualizar cliente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClienteDto,
  ) {
    return this.clientesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Inativar cliente (ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientesService.remove(id);
  }
}
