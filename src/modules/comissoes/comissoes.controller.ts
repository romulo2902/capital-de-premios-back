import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComissoesService } from './comissoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Comissões')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('comissoes')
export class ComissoesController {
  constructor(private readonly comissoesService: ComissoesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar comissao' })
  findAll() {
    return this.comissoesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar comissoes por ID' })
  findOne(@Param('id') id: string) {
    return this.comissoesService.findOne(id);
  }
}
