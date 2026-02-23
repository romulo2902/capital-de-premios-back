import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EdicoesService } from './edicoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Edições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('edicoes')
export class EdicoesController {
  constructor(private readonly edicoesService: EdicoesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar edicao' })
  findAll() {
    return this.edicoesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar edicoes por ID' })
  findOne(@Param('id') id: string) {
    return this.edicoesService.findOne(id);
  }
}
