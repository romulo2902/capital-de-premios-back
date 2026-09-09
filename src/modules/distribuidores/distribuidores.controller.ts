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
  findAll(@Query() filtros: FiltroDistribuidoresDto) {
    return this.distribuidoresService.findAll(
      filtros.page,
      filtros.limit,
      filtros.search,
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
}
