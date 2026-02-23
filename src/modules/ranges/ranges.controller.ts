import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RangesService } from './ranges.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Ranges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ranges')
export class RangesController {
  constructor(private readonly rangesService: RangesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar range' })
  findAll() {
    return this.rangesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar ranges por ID' })
  findOne(@Param('id') id: string) {
    return this.rangesService.findOne(id);
  }
}
