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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { MaquininhasService } from './maquininhas.service';
import { CreditosMaquininhaService } from './creditos-maquininha.service';
import { CreateMaquininhaDto } from './dto/create-maquininha.dto';
import { UpdateMaquininhaDto } from './dto/update-maquininha.dto';
import { FiltroMaquininhasDto } from './dto/filtro-maquininhas.dto';
import { LancarCreditoMaquininhaDto } from './dto/lancar-credito-maquininha.dto';
import { FiltroMovimentosCreditoDto } from './dto/filtro-movimentos-credito.dto';
import { AtualizarLimiteCreditoDto } from './dto/atualizar-limite-credito.dto';

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
  constructor(
    private readonly maquininhasService: MaquininhasService,
    private readonly creditosService: CreditosMaquininhaService,
  ) {}

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

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Excluir maquininha (ADMIN apenas)',
    description:
      'Exclusão **lógica**: o registro é preservado e o aparelho some de toda listagem, inclusive do seletor do POS. Não é o mesmo que `status: INATIVA` — inativa é aparelho fora de operação que segue na frota e o DISTRIBUIDOR reativa; excluída sai da frota e não volta.\n\nO registro nunca é apagado de verdade porque o razão de crédito (`MovimentoCreditoMaquininha`) referencia a maquininha; um DELETE físico levaria o histórico junto.\n\nAparelho com saldo de crédito responde **409**: zere com um `AJUSTE_DEBITO` antes, para a retirada ficar no extrato em vez do dinheiro sumir junto com o aparelho.\n\nA série continua ocupada depois da exclusão e não pode ser recadastrada.',
  })
  @ApiResponse({ status: 200, description: 'Maquininha excluída.' })
  @ApiResponse({ status: 403, description: 'Perfil sem permissão.' })
  @ApiResponse({ status: 404, description: 'Maquininha não encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Aparelho ainda tem saldo de crédito.',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.maquininhasService.remove(id, user);
  }

  // ─── Crédito do aparelho ──────────────────────────────────────────

  @Patch(':id/limite')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Definir limite de crédito da maquininha (ADMIN apenas)',
    description:
      'Define o teto de crédito do aparelho em reais, entre 0 e **10.000**. Aparelho novo já nasce com R$ 2.000,00, então esta rota serve para ajustar. `limiteCredito: 0` significa NÃO CONFIGURADO e faz o aparelho **recusar venda MANUAL** com 409. Para travar um aparelho que já opera use `PATCH /admin/maquininhas/:id` com `status: INATIVA`.\n\nBaixar o limite não confisca saldo já concedido: o saldo atual fica onde está e apenas para de aceitar recarga até consumir a diferença. Para retirar crédito da mão do vendedor, lance um `AJUSTE_DEBITO` — assim a retirada fica no extrato.\n\nRota separada do `PATCH /admin/maquininhas/:id` porque aquele aceita DISTRIBUIDOR, e o limite é decisão da matriz.',
  })
  @ApiResponse({ status: 200, description: 'Limite atualizado.' })
  @ApiResponse({
    status: 400,
    description: 'Limite negativo, acima de R$ 10.000,00 ou malformado.',
  })
  @ApiResponse({ status: 403, description: 'Perfil sem permissão.' })
  @ApiResponse({ status: 404, description: 'Maquininha não encontrada.' })
  atualizarLimite(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarLimiteCreditoDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.creditosService.atualizarLimite(id, dto, user);
  }

  @Post(':id/creditos')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Lançar crédito na maquininha (ADMIN apenas)',
    description:
      'Lança `RECARGA` (concede crédito), `AJUSTE_CREDITO` ou `AJUSTE_DEBITO` (corrigem o saldo). O `valor` é sempre positivo — o sinal vem do `tipo`. Nos ajustes o `motivo` é obrigatório.\n\n`CONSUMO` e `ESTORNO` não são aceitos aqui: nascem da venda MANUAL e do cancelamento dela, dentro da transação de cada uma.\n\nA recarga não passa do `limiteCredito` do aparelho — se passar, responde 409.',
  })
  @ApiResponse({ status: 201, description: 'Movimento lançado.' })
  @ApiResponse({
    status: 400,
    description: 'Tipo não permitido, valor não positivo ou ajuste sem motivo.',
  })
  @ApiResponse({ status: 403, description: 'Perfil sem permissão.' })
  @ApiResponse({ status: 404, description: 'Maquininha não encontrada.' })
  @ApiResponse({
    status: 409,
    description: 'Recarga acima do limite, ou débito maior que o saldo.',
  })
  lancarCredito(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LancarCreditoMaquininhaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.creditosService.lancarMovimento(id, dto, user);
  }

  @Get(':id/creditos')
  @Roles('ADMIN', 'DISTRIBUIDOR')
  @ApiOperation({
    summary: 'Extrato de crédito da maquininha (ADMIN + DISTRIBUIDOR)',
    description:
      'Histórico de todo movimento de crédito do aparelho, do mais recente para o mais antigo, com `saldoAnterior` e `saldoPosterior` congelados no momento do lançamento e a venda vinculada quando houver.\n\nDISTRIBUIDOR só alcança aparelho da própria rede; fora disso responde 404. Aparelho inativado continua com o extrato consultável.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'tipo',
    required: false,
    enum: ['RECARGA', 'CONSUMO', 'ESTORNO', 'AJUSTE_CREDITO', 'AJUSTE_DEBITO'],
    description: 'Filtrar por tipo de movimento.',
  })
  @ApiQuery({
    name: 'dataInicio',
    required: false,
    type: String,
    description: 'Início do período, em ISO 8601.',
  })
  @ApiQuery({
    name: 'dataFim',
    required: false,
    type: String,
    description: 'Fim do período, em ISO 8601.',
  })
  @ApiResponse({ status: 404, description: 'Maquininha não encontrada.' })
  async extratoCredito(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() filtros: FiltroMovimentosCreditoDto,
    @CurrentUser() user: RequestUser,
  ) {
    // O escopo é validado antes de ler o extrato: sem isso, um distribuidor
    // leria o movimento de aparelho de outra rede chutando UUID.
    await this.maquininhasService.garantirAcessoAoAparelho(id, user);
    return this.creditosService.extrato(id, filtros);
  }
}
