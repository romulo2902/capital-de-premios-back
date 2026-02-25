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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { VendedoresService } from './vendedores.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';

@ApiTags('Admin / Vendedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/vendedores')
export class VendedoresController {
  constructor(private readonly vendedoresService: VendedoresService) {}

  @Post()
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Criar vendedor (ADMIN ou DISTRIBUIDOR)' })
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
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('distribuidorId') distribuidorId?: string,
  ) {
    return this.vendedoresService.findAll(+page, +limit, search, distribuidorId);
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar vendedor por ID (ADMIN + DISTRIBUIDOR)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendedoresService.findOne(id);
  }

  @Get('codigo/:codigo')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar vendedor por código sequencial' })
  findByCodigo(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.vendedoresService.findByCodigo(codigo);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Atualizar vendedor (ADMIN + DISTRIBUIDOR)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendedorDto,
  ) {
    return this.vendedoresService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Inativar vendedor' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendedoresService.remove(id);
  }
}
