import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SaquesService } from './saques.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Saques')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('saques')
export class SaquesController {
  constructor(private readonly saquesService: SaquesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar saque' })
  findAll() {
    return this.saquesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar saques por ID' })
  findOne(@Param('id') id: string) {
    return this.saquesService.findOne(id);
  }
}
