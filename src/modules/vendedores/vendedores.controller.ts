import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VendedoresService } from './vendedores.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Vendedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendedores')
export class VendedoresController {
  constructor(private readonly vendedoresService: VendedoresService) {}

  @Get()
  @ApiOperation({ summary: 'Listar vendedor' })
  findAll() {
    return this.vendedoresService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar vendedores por ID' })
  findOne(@Param('id') id: string) {
    return this.vendedoresService.findOne(id);
  }
}
