import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DistribuidoresService } from './distribuidores.service';
import { CreateDistribuidorDto } from './dto/create-distribuidor.dto';
import { UpdateDistribuidorDto } from './dto/update-distribuidor.dto';
import { FiltroPerformanceDto } from './dto/filtro-performance.dto';
import { FiltroDistribuidoresDto } from './dto/filtro-distribuidores.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Admin / Distribuidores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/distribuidores')
export class DistribuidoresController {
  constructor(private readonly distribuidoresService: DistribuidoresService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar distribuidor (ADMIN)' })
  create(@Body() dto: CreateDistribuidorDto) {
    return this.distribuidoresService.create(dto);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar distribuidores (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'excluidos',
    required: false,
    type: Boolean,
    description:
      'Lista **apenas** os distribuidores excluídos, em vez de somá-los à listagem normal. É a única porta por onde o id de um excluído sai da API — use para alcançar `PATCH /admin/distribuidores/{id}/restaurar`.',
  })
  findAll(@Query() filtros: FiltroDistribuidoresDto) {
    return this.distribuidoresService.findAll(
      filtros.page,
      filtros.limit,
      filtros.search,
      filtros.excluidos,
    );
  }

  @Get('performance')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Performance de vendas dos distribuidores — Top 10 + listagem (ADMIN)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoId', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  performanceVendas(@Query() filtros: FiltroPerformanceDto) {
    return this.distribuidoresService.performanceVendas(
      filtros.page,
      filtros.limit,
      filtros,
    );
  }

  @Get('link-cadastro')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary:
      'Consultar o link público de auto-cadastro de vendedor (ADMIN + DISTRIBUIDOR)',
    description:
      'Devolve o token e a URL pronta para o distribuidor divulgar. Quem abrir ' +
      'o link preenche um formulário e entra como vendedor **pendente** da rede. ' +
      'DISTRIBUIDOR sempre recebe o da própria rede — o `distribuidorId` da query ' +
      'é descartado; ADMIN precisa informá-lo.',
  })
  @ApiQuery({
    name: 'distribuidorId',
    required: false,
    type: String,
    description: 'Obrigatório para ADMIN. Ignorado para DISTRIBUIDOR.',
  })
  consultarLinkCadastro(
    @Query('distribuidorId') distribuidorId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.distribuidoresService.consultarLinkCadastro(
      distribuidorId,
      user,
    );
  }

  @Post('link-cadastro/regenerar')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Regenerar o link público de auto-cadastro (ADMIN + DISTRIBUIDOR)',
    description:
      'Gera um token novo e **derruba o anterior na hora** — é o jeito de ' +
      'estancar um link que vazou ou que passou a receber cadastro falso. ' +
      'Quem já foi cadastrado pelo link antigo não é afetado.',
  })
  @ApiQuery({
    name: 'distribuidorId',
    required: false,
    type: String,
    description: 'Obrigatório para ADMIN. Ignorado para DISTRIBUIDOR.',
  })
  regenerarLinkCadastro(
    @Query('distribuidorId') distribuidorId: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.distribuidoresService.regenerarTokenCadastro(
      distribuidorId,
      user,
    );
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Buscar distribuidor por ID (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.distribuidoresService.findOne(id);
  }

  @Get('codigo/:codigo')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Buscar distribuidor por código sequencial (ADMIN)',
  })
  findByCodigo(@Param('codigo', ParseIntPipe) codigo: number) {
    return this.distribuidoresService.findByCodigo(codigo);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar distribuidor (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDistribuidorDto,
  ) {
    return this.distribuidoresService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Inativar distribuidor (ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.distribuidoresService.remove(id);
  }

  @Delete(':id/excluir')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Excluir distribuidor (ADMIN apenas)',
    description:
      'Exclusão lógica: o distribuidor some de toda listagem e do seletor de rede, mas o registro fica — Venda, ComissaoDistribuidor, Saque e Maquininha apontam para ele, e apagar de verdade levaria o histórico junto. É estado distinto de `INATIVO`, que segue na listagem e é reativado pelo `PATCH`. Excluir também inativa o distribuidor e o usuário na mesma transação. Responde 409 com saldo pendente, com vendedores na rede ou com maquininhas na frota: `Vendedor.distribuidorId` e `Maquininha.distribuidorId` são obrigatórios, então esvazie a rede antes. Para desfazer, use `PATCH /admin/distribuidores/{id}/restaurar`.',
  })
  @ApiParam({ name: 'id', description: 'ID do distribuidor' })
  excluir(@Param('id', ParseUUIDPipe) id: string) {
    return this.distribuidoresService.excluir(id);
  }

  @Patch(':id/restaurar')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Restaurar distribuidor excluído (ADMIN apenas)',
    description:
      'Devolve à listagem um distribuidor excluído. Ele volta `INATIVO`, não `ATIVO`: quem decide se opera de novo é o `PATCH /admin/distribuidores/{id}` com `status: ATIVO`. Para descobrir o id, liste com `GET /admin/distribuidores?excluidos=true`. Distribuidor que não está excluído responde 409.',
  })
  @ApiParam({ name: 'id', description: 'ID do distribuidor excluído' })
  restaurar(@Param('id', ParseUUIDPipe) id: string) {
    return this.distribuidoresService.restaurar(id);
  }
}
