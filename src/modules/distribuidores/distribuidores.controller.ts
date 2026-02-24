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
import { DistribuidoresService } from './distribuidores.service';
import { CreateDistribuidorDto } from './dto/create-distribuidor.dto';
import { UpdateDistribuidorDto } from './dto/update-distribuidor.dto';

@ApiTags('Distribuidores')
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
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
  ) {
    return this.distribuidoresService.findAll(+page, +limit, search);
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar distribuidor por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.distribuidoresService.findOne(id);
  }

  @Get('codigo/:codigo')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar distribuidor por código sequencial' })
  findByCodigo(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.distribuidoresService.findByCodigo(codigo);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Atualizar distribuidor (ADMIN ou próprio DISTRIBUIDOR)' })
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
