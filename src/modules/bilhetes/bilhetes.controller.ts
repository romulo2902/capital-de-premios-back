import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BilhetesService } from './bilhetes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Bilhetes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bilhetes')
export class BilhetesController {
  constructor(private readonly bilhetesService: BilhetesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar bilhete' })
  findAll() {
    return this.bilhetesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar bilhetes por ID' })
  findOne(@Param('id') id: string) {
    return this.bilhetesService.findOne(id);
  }
}
