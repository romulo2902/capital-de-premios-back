import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DistribuidoresService } from './distribuidores.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Distribuidores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('distribuidores')
export class DistribuidoresController {
  constructor(private readonly distribuidoresService: DistribuidoresService) {}

  @Get()
  @ApiOperation({ summary: 'Listar distribuidor' })
  findAll() {
    return this.distribuidoresService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar distribuidores por ID' })
  findOne(@Param('id') id: string) {
    return this.distribuidoresService.findOne(id);
  }
}
