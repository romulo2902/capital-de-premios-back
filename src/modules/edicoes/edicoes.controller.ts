import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EdicoesService } from './edicoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateEdicaoDto } from './dto/create-edicao.dto';
import { UpdateEdicaoDto } from './dto/update-edicao.dto';

@ApiTags('Admin / Edições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/edicoes')
export class EdicoesController {
  constructor(private readonly edicoesService: EdicoesService) {}

  @Post()
  @ApiOperation({ summary: 'Criar edição/cartela com detalhes de range (ADMIN)' })
  create(@Body() dto: CreateEdicaoDto) {
    return this.edicoesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar edições (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.edicoesService.findAll(+page, +limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar edição por ID (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar edição/cartela e seus detalhes (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEdicaoDto,
  ) {
    return this.edicoesService.update(id, dto);
  }

  @Patch(':id/ativar')
  @ApiOperation({ summary: 'Ativar edição (ADMIN)' })
  ativar(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesService.ativar(id);
  }

  @Patch(':id/desativar')
  @ApiOperation({ summary: 'Desativar edição (ADMIN)' })
  desativar(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesService.desativar(id);
  }
}
