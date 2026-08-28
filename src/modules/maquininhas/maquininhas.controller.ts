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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { MaquininhasService } from './maquininhas.service';
import { CreateMaquininhaDto } from './dto/create-maquininha.dto';
import { UpdateMaquininhaDto } from './dto/update-maquininha.dto';
import { FiltroMaquininhasDto } from './dto/filtro-maquininhas.dto';

/**
 * Maquininhas de cartão no painel administrativo.
 *
 * ADMIN enxerga e edita o parque inteiro, escolhendo a rede de cada aparelho.
 * DISTRIBUIDOR só alcança as próprias: a rede vem do token, o `distribuidorId`
 * do corpo é ignorado e aparelho de outra rede responde 404.
 */
@ApiTags('Admin / Maquininhas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/maquininhas')
export class MaquininhasController {
  constructor(private readonly maquininhasService: MaquininhasService) {}

  @Post()
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Cadastrar maquininha (ADMIN + DISTRIBUIDOR)',
    description:
      'ADMIN informa a rede pelo `distribuidorId`, obrigatório para esse perfil. DISTRIBUIDOR cadastra sempre na própria rede — o `distribuidorId` do corpo é descartado. O `numeroSerie` é normalizado (sem espaços, caixa alta) e é único global. O `vendedorId` é opcional: omitido, o aparelho fica no estoque do distribuidor.',
  })
  @ApiResponse({ status: 201, description: 'Maquininha cadastrada.' })
  @ApiResponse({
    status: 400,
    description:
      'Dados inválidos, `distribuidorId` ausente para ADMIN, ou vendedor fora da rede do aparelho.',
  })
  @ApiResponse({ status: 403, description: 'Perfil sem permissão.' })
  @ApiResponse({ status: 409, description: 'Número de série já cadastrado.' })
  create(@Body() dto: CreateMaquininhaDto, @CurrentUser() user: RequestUser) {
    return this.maquininhasService.create(dto, user);
  }

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Listar maquininhas (ADMIN + DISTRIBUIDOR)',
    description:
      'ADMIN vê todas e pode filtrar por rede com `distribuidorId`. DISTRIBUIDOR vê apenas as da própria rede, e o filtro por rede é ignorado.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Busca por número de série, apelido ou operadora.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['ATIVA', 'INATIVA'] })
  @ApiQuery({
    name: 'distribuidorId',
    required: false,
    type: String,
    description: 'Filtrar por rede. Só tem efeito para ADMIN.',
  })
  findAll(
    @Query() filtros: FiltroMaquininhasDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maquininhasService.findAll(filtros, user);
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Buscar maquininha por ID (ADMIN + DISTRIBUIDOR)',
    description:
      'Aparelho fora do alcance do operador responde 404, não 403 — responder diferente entregaria a existência de equipamento de outra rede.',
  })
  @ApiResponse({ status: 404, description: 'Maquininha não encontrada.' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maquininhasService.findOne(id, user);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Atualizar maquininha (ADMIN + DISTRIBUIDOR)',
    description:
      'Edita os dados, troca o vendedor e inativa/reativa. `vendedorId: null` devolve o aparelho ao estoque; o campo ausente mantém o vínculo. Transferir de rede (`distribuidorId`) é privilégio do ADMIN — para o DISTRIBUIDOR o campo é descartado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Vendedor fora da rede do aparelho.',
  })
  @ApiResponse({ status: 404, description: 'Maquininha não encontrada.' })
  @ApiResponse({ status: 409, description: 'Número de série já cadastrado.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMaquininhaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maquininhasService.update(id, dto, user);
  }
}
