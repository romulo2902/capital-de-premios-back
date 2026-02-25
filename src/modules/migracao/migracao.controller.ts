import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MigracaoService } from './migracao.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin / Migração')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/migracao')
export class MigracaoController {
  constructor(private readonly migracaoService: MigracaoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar migrações (ADMIN apenas)' })
  findAll() {
    return this.migracaoService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar migração por ID (ADMIN apenas)' })
  findOne(@Param('id') id: string) {
    return this.migracaoService.findOne(id);
  }
}
