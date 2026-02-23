import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VendasService } from './vendas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Vendas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendas')
export class VendasController {
  constructor(private readonly vendasService: VendasService) {}

  @Get()
  @ApiOperation({ summary: 'Listar venda' })
  findAll() {
    return this.vendasService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar vendas por ID' })
  findOne(@Param('id') id: string) {
    return this.vendasService.findOne(id);
  }
}
