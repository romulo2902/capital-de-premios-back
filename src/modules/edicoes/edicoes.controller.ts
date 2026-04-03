import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
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
import { FileInterceptor } from '@nestjs/platform-express';
import { EdicoesService } from './edicoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateEdicaoDto } from './dto/create-edicao.dto';
import { UpdateEdicaoDto } from './dto/update-edicao.dto';
import {
  CreateEdicaoUploadDto,
  UpdateEdicaoUploadDto,
} from './dto/edicao-upload.dto';
import type { ArquivoImagemUpload } from './edicoes.types';

@ApiTags('Admin / Edições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/edicoes')
export class EdicoesController {
  constructor(private readonly edicoesService: EdicoesService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar edição/cartela com detalhes de range (ADMIN)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateEdicaoUploadDto })
  @UseInterceptors(FileInterceptor('imagem'))
  create(
    @Body() dto: CreateEdicaoDto,
    @UploadedFile() imagem?: ArquivoImagemUpload,
  ) {
    return this.edicoesService.create(dto, imagem);
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
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateEdicaoUploadDto })
  @UseInterceptors(FileInterceptor('imagem'))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEdicaoDto,
    @UploadedFile() imagem?: ArquivoImagemUpload,
  ) {
    return this.edicoesService.update(id, dto, imagem);
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
