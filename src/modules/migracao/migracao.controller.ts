import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MigracaoService } from './migracao.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Migração')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/migracao')
export class MigracaoController {
  constructor(private readonly migracaoService: MigracaoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar migracao' })
  findAll() {
    return this.migracaoService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar migracao por ID' })
  findOne(@Param('id') id: string) {
    return this.migracaoService.findOne(id);
  }
}
