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
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EdicoesSenaService } from './edicoes-sena.service';
import { CreateEdicaoSenaDto } from './dto/create-edicao-sena.dto';
import { UpdateEdicaoSenaDto } from './dto/update-edicao-sena.dto';
import { ListarEdicoesSenaLojaDto } from './dto/listar-edicoes-sena-loja.dto';

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
      'Envie via JSON. A imagem da edição deve ir em `imagemBase64` e as imagens dos prêmios em `premios[].imagemBase64`, seguindo o padrão do CDP.',
  })
  create(@Body() dto: CreateEdicaoSenaDto) {
    return this.edicoesSenaService.create(dto);
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
    description:
      'Envie via JSON. Para trocar a capa, informe `imagemBase64`. Para trocar imagens de prêmios, informe `premios[].imagemBase64`.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEdicaoSenaDto,
  ) {
    return this.edicoesSenaService.update(id, dto);
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

@ApiTags('Sena / Loja')
@Controller('capital-sena')
export class EdicoesSenaPublicoController {
  constructor(private readonly edicoesSenaService: EdicoesSenaService) {}

  @Get('edicoes')
  @ApiOperation({
    summary: 'Listar edições Sena disponíveis para a loja',
    description:
      'Lista edições públicas do Capital Sena. Sem informar `status`, retorna somente edições ATIVAS, prontas para compra pelo cliente.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['ATIVA', 'ENCERRADA', 'APURANDO', 'FINALIZADA'],
  })
  findAllPublicas(@Query() filtros: ListarEdicoesSenaLojaDto) {
    return this.edicoesSenaService.findAllPublicas(
      filtros.page,
      filtros.limit,
      filtros.status,
    );
  }

  @Get('edicao-ativa')
  @ApiOperation({
    summary: 'Buscar edição Sena ativa para compra',
    description:
      'Atalho para o frontend da loja carregar a edição vigente com prêmios e combos ativos.',
  })
  findAtiva() {
    return this.edicoesSenaService.findAtiva();
  }

  @Get('edicoes/:id')
  @ApiOperation({ summary: 'Detalhar edição Sena pública por ID' })
  findOnePublica(@Param('id', ParseUUIDPipe) id: string) {
    return this.edicoesSenaService.findOnePublica(id);
  }
}
