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
import { DistribuidoresService } from './distribuidores.service';
import { CreateDistribuidorDto } from './dto/create-distribuidor.dto';
import { UpdateDistribuidorDto } from './dto/update-distribuidor.dto';
import { FiltroPerformanceDto } from './dto/filtro-performance.dto';
import { FiltroDistribuidoresDto } from './dto/filtro-distribuidores.dto';

@ApiTags('Admin / Distribuidores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/distribuidores')
export class DistribuidoresController {
  constructor(private readonly distribuidoresService: DistribuidoresService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar distribuidor (ADMIN)' })
  create(@Body() dto: CreateDistribuidorDto) {
    return this.distribuidoresService.create(dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar distribuidores (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(@Query() filtros: FiltroDistribuidoresDto) {
    return this.distribuidoresService.findAll(
      filtros.page,
      filtros.limit,
      filtros.search,
    );
  }

  @Get('performance')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Performance de vendas dos distribuidores — Top 10 + listagem (ADMIN)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoId', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  performanceVendas(@Query() filtros: FiltroPerformanceDto) {
    return this.distribuidoresService.performanceVendas(
      filtros.page,
      filtros.limit,
      filtros,
    );
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar distribuidor por ID (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.distribuidoresService.findOne(id);
  }

  @Get('codigo/:codigo')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Buscar distribuidor por código sequencial (ADMIN)',
  })
  findByCodigo(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.distribuidoresService.findByCodigo(codigo);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar distribuidor (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDistribuidorDto,
  ) {
    return this.distribuidoresService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Inativar distribuidor (ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.distribuidoresService.remove(id);
  }
}
