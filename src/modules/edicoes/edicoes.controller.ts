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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { EdicoesService } from './edicoes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateEdicaoDto } from './dto/create-edicao.dto';
import { UpdateEdicaoDto } from './dto/update-edicao.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Admin / Edições')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/edicoes')
export class EdicoesController {
  constructor(private readonly edicoesService: EdicoesService) {}

  @Post()
  @ApiConsumes('application/json')
  @ApiOperation({
    summary: 'Criar edição com matriz, combos e prêmios detalhados (ADMIN)',
    description:
      'Cria uma nova edição em RASCUNHO. As imagens devem ser enviadas via Base64 no JSON (`imagemBase64` na raiz para a edição e dentro de cada objeto no array `premios`).',
  })
  create(@Body() dto: CreateEdicaoDto) {
    return this.edicoesService.create(dto);
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
  @ApiConsumes('application/json')
  @ApiOperation({
    summary: 'Atualizar edição, combos e prêmios detalhados (ADMIN)',
    description:
      'Atualiza a edição e seus relacionamentos. As imagens podem ser atualizadas via Base64. Prêmios com `id` são atualizados, sem `id` são criados, e prêmios omitidos são removidos.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEdicaoDto,
  ) {
    return this.edicoesService.update(id, dto);
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
