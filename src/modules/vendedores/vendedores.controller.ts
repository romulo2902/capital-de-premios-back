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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VendedoresService } from './vendedores.service';
import { CreateVendedorDto } from './dto/create-vendedor.dto';
import { UpdateVendedorDto } from './dto/update-vendedor.dto';
import { FiltroPerformanceDto } from './dto/filtro-performance.dto';
import { FiltroVendedoresDto } from './dto/filtro-vendedores.dto';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Admin / Vendedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/vendedores')
export class VendedoresController {
  constructor(private readonly vendedoresService: VendedoresService) {}

  @Post()
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Criar vendedor (ADMIN + DISTRIBUIDOR)',
    description:
      'ADMIN escolhe a rede pelo `distribuidorId` do corpo, que é obrigatório para esse perfil. DISTRIBUIDOR cadastra sempre na própria rede: o `distribuidorId` do corpo é ignorado e substituído pelo vínculo do token.',
  })
  create(@Body() dto: CreateVendedorDto, @CurrentUser() user: RequestUser) {
    return this.vendedoresService.create(dto, user);
  }

  @Get()
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Listar vendedores' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'distribuidorId', required: false, type: String })
  findAll(
    @Query() filtros: FiltroVendedoresDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.findAll(
      filtros.page,
      filtros.limit,
      filtros.search,
      filtros.distribuidorId,
      user,
      filtros.pendentes,
    );
  }

  @Patch(':id/aprovar')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary:
      'Aprovar auto-cadastro de vendedor (ADMIN + DISTRIBUIDOR da própria rede)',
    description:
      'Libera um vendedor que se cadastrou pelo link público. Ativa o vendedor ' +
      'e o usuário na mesma transação e carimba `aprovadoEm`. Serve também para ' +
      'reverter uma recusa: cadastro com `rejeitadoEm` é liberado e o carimbo ' +
      'da recusa é limpo — é o caminho de volta de quem foi recusado por ' +
      'engano, já que a linha recusada segura o CPF e impede o recadastro. ' +
      'Vendedor de outra rede responde 404; vendedor já aprovado responde 409.',
  })
  @ApiParam({ name: 'id', description: 'ID do vendedor pendente' })
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.aprovar(id, user);
  }

  @Get('performance')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Performance de vendas dos vendedores — Top 10 + listagem (ADMIN)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'edicaoId', required: false, type: String })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  performanceVendas(@Query() filtros: FiltroPerformanceDto) {
    return this.vendedoresService.performanceVendas(
      filtros.page,
      filtros.limit,
      filtros,
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar vendedor por ID' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.findOne(id, user);
  }

  @Get('codigo/:codigo')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({ summary: 'Buscar vendedor por código sequencial' })
  findByCodigo(
    @Param('codigo', ParseIntPipe) codigo: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.findByCodigo(codigo, user);
  }

  @Patch(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Atualizar vendedor (ADMIN + DISTRIBUIDOR)',
    description:
      'DISTRIBUIDOR só alcança vendedor da própria rede — os demais respondem 404 — e não consegue transferir o vendedor para outra rede: o `distribuidorId` do corpo é descartado. ADMIN edita qualquer vendedor, transferência inclusa. Em auto-cadastro ainda pendente, o `status` do corpo decide o cadastro: `ATIVO` vale como aprovação (carimba `aprovadoEm` e limpa `rejeitadoEm`) e `INATIVO` vale como recusa (carimba `rejeitadoEm`) — os dois tiram o cadastro da fila de pendentes, igual aos endpoints dedicados.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendedorDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Inativar vendedor (ADMIN + DISTRIBUIDOR)',
    description:
      'Inativação lógica: o vendedor passa a `INATIVO`, o registro é preservado e o histórico de vendas e comissões continua intacto. DISTRIBUIDOR só alcança vendedor da própria rede — os demais respondem 404. Em auto-cadastro ainda pendente vale como **recusa**: como o pendente já nasce `INATIVO`, o que marca a decisão é o carimbo `rejeitadoEm`, que tira o cadastro da fila de pendentes. Para reverter, use `PATCH /admin/vendedores/{id}/aprovar`.',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.vendedoresService.remove(id, user);
  }
}
