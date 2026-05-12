import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EdicoesSenaService } from './edicoes-sena.service';
import type { ArquivosEdicaoSena } from './edicoes-sena.service';
import { CreateEdicaoSenaDto } from './dto/create-edicao-sena.dto';
import { UpdateEdicaoSenaDto } from './dto/update-edicao-sena.dto';
import { CreateEdicaoSenaUploadDto, UpdateEdicaoSenaUploadDto } from './dto/edicao-sena-upload.dto';

@ApiTags('Sena Admin / Edições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/capital-sena/edicoes')
export class EdicoesSenaController {
  constructor(private readonly edicoesSenaService: EdicoesSenaService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Criar edição Sena com prêmios e combos',
    description:
      'Envie via `multipart/form-data`. Os campos de texto são serializados como JSON strings. ' +
      'As imagens são enviadas como arquivos: `imagem` (capa) e `premioImagens[]` (uma por prêmio, na mesma ordem do array `premios`).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateEdicaoSenaUploadDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'imagem', maxCount: 1 },
      { name: 'premioImagens', maxCount: 10 },
    ]),
  )
  create(
    @Body() dto: CreateEdicaoSenaDto,
    @UploadedFiles() arquivos?: ArquivosEdicaoSena,
  ) {
    return this.edicoesSenaService.create(dto, arquivos);
  }

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar edições Sena (paginado)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.edicoesSenaService.findAll(pagination.page, pagination.limit);
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({ summary: 'Detalhar edição Sena por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesSenaService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Atualizar edição Sena',
    description: 'Envie via `multipart/form-data`. Envie somente os campos que deseja alterar. ' +
      'Imagens opcionais: `imagem` (nova capa) e `premioImagens[]` (novas imagens de prêmios).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateEdicaoSenaUploadDto })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'imagem', maxCount: 1 },
      { name: 'premioImagens', maxCount: 10 },
    ]),
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEdicaoSenaDto,
    @UploadedFiles() arquivos?: ArquivosEdicaoSena,
  ) {
    return this.edicoesSenaService.update(id, dto, arquivos);
  }

  @Patch(':id/ativar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Ativar edição Sena (apenas uma ativa por vez)' })
  ativar(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesSenaService.ativar(id);
  }

  @Patch(':id/encerrar')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Encerrar edição Sena ativa' })
  encerrar(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesSenaService.encerrar(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Excluir edição Sena (somente RASCUNHO)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesSenaService.remove(id);
  }
}
