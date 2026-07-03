import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConteudoService } from './conteudo.service';
import { CreatePaginaDto } from './dto/create-pagina.dto';
import { UpdatePaginaDto } from './dto/update-pagina.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin / Conteúdo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/conteudo')
export class ConteudoController {
  constructor(private readonly conteudoService: ConteudoService) {}

  @Post()
  @ApiOperation({ summary: 'Criar nova página de conteúdo (ADMIN)' })
  create(@Body() createPaginaDto: CreatePaginaDto) {
    return this.conteudoService.create(createPaginaDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as páginas (ADMIN)' })
  findAll() {
    return this.conteudoService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar página por ID (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.conteudoService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar página (ADMIN)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() updatePaginaDto: UpdatePaginaDto) {
    return this.conteudoService.update(id, updatePaginaDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover página (ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.conteudoService.remove(id);
  }
}
