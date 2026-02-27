import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EdicoesService } from './edicoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin / Edições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/edicoes')
export class EdicoesController {
  constructor(private readonly edicoesService: EdicoesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar edições (ADMIN)' })
  findAll() {
    return this.edicoesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar edição por ID (ADMIN)' })
  findOne(@Param('id') id: string) {
    return this.edicoesService.findOne(id);
  }
}
