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
import { AnyFilesInterceptor } from '@nestjs/platform-express';
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
import type { ArquivosEdicaoUpload } from './edicoes.types';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Admin / Edições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/edicoes')
export class EdicoesController {
  constructor(private readonly edicoesService: EdicoesService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar edição com matriz, combos e prêmios detalhados (ADMIN)',
    description:
      'Cria uma nova edição em RASCUNHO. Para os campos de data no Swagger, use o formato `YYYY-MM-DDTHH:mm`, por exemplo `2026-04-28T15:30`. Para imagens de prêmio, envie os arquivos com o nome do campo por ordem, como `premioImagens[1]` e `premioImagens[3]`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateEdicaoUploadDto })
  @UseInterceptors(AnyFilesInterceptor())
  create(
    @Body() dto: CreateEdicaoDto,
    @UploadedFiles() arquivos?: ArquivosEdicaoUpload,
  ) {
    return this.edicoesService.create(dto, arquivos);
  }

  @Get()
  @ApiOperation({ summary: 'Listar edições (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.edicoesService.findAll(pagination.page, pagination.limit);
  }

  @Get('ultima')
  @ApiOperation({
    summary:
      'Retornar a última edição cadastrada, independente do status (ADMIN). Útil para pré-preencher o formulário de nova edição.',
  })
  findUltima() {
    return this.edicoesService.findUltima();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar edição por ID (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Atualizar edição, combos e prêmios detalhados (ADMIN)',
    description:
      'Atualiza a edição e seus relacionamentos. Para os campos de data no Swagger, use o formato `YYYY-MM-DDTHH:mm`, por exemplo `2026-04-28T15:30`. As imagens dos prêmios também podem ser enviadas por campo nomeado, como `premioImagens[2]`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateEdicaoUploadDto })
  @UseInterceptors(AnyFilesInterceptor())
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEdicaoDto,
    @UploadedFiles() arquivos?: ArquivosEdicaoUpload,
  ) {
    return this.edicoesService.update(id, dto, arquivos);
  }

  @Patch(':id/ativar')
  @ApiOperation({
    summary: 'Ativar edição (ADMIN)',
    description:
      'Move a edição para ATIVA, liberando a operação normal de vendas. Para testar sorteio, o fluxo esperado é: criar/ajustar a edição, ativar e aguardar o autoencerramento quando `dataEncerramento` for atingida.',
  })
  ativar(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesService.ativar(id);
  }

  @Patch(':id/desativar')
  @ApiOperation({
    summary: 'Desativar edição (ADMIN)',
    description:
      'Retorna a edição para RASCUNHO, desde que ela ainda não tenha sido encerrada ou sorteada.',
  })
  desativar(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesService.desativar(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Excluir edição e remover dados relacionados em cascata (ADMIN). Permitido apenas para edições em RASCUNHO.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesService.remove(id);
  }
}
