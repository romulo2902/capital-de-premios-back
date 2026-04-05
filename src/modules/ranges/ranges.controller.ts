import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RangesService } from './ranges.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FiltroRangesDto } from './dto/filtro-ranges.dto';

@ApiTags('Ranges')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/ranges')
export class RangesController {
  constructor(private readonly rangesService: RangesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar range' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoId', required: false, type: String })
  @ApiQuery({ name: 'numeroInicio', required: false, type: Number })
  @ApiQuery({ name: 'numeroFim', required: false, type: Number })
  @ApiQuery({ name: 'disponivel', required: false, type: Boolean })
  findAll(@Query() filtros: FiltroRangesDto) {
    return this.rangesService.findAll(filtros);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar ranges por ID' })
  findOne(@Param('id') id: string) {
    return this.rangesService.findOne(id);
  }
}
