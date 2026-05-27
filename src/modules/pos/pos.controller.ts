import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { PosAuthGuard } from './guards/pos-auth.guard';
import { PosAuthService } from './pos-auth.service';
import { PosService } from './pos.service';
import { LoginPosDto } from './dto/login-pos.dto';
import { CreatePosVendaDto } from './dto/create-pos-venda.dto';
import { CreatePosVendaSenaDto } from './dto/create-pos-venda-sena.dto';
import { ConfirmarPagamentoPosDto } from './dto/confirmar-pagamento-pos.dto';
import { ListarCombosAdminDto } from '../vendas/dto/listar-combos-admin.dto';

/**
 * ## POS — Terminais de venda (Capital de Prêmios + Capital Sena)
 *
 * Login apenas por CPF (VENDEDOR/DISTRIBUIDOR), sessão longa e um único botão de
 * logout no terminal. O pagamento é processado na maquininha; a venda nasce
 * PENDENTE e é confirmada ao receber a resposta do PagBank.
 */
@ApiTags('POS')
@Controller('pos')
export class PosController {
  constructor(
    private readonly posAuthService: PosAuthService,
    private readonly posService: PosService,
  ) {}

  // ─── Autenticação ─────────────────────────────────────────────────

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login do POS por CPF (VENDEDOR + DISTRIBUIDOR) — sem senha',
    description:
      'Autentica o operador do terminal apenas pelo CPF e emite um token de sessão longa.',
  })
  login(@Body() dto: LoginPosDto) {
    return this.posAuthService.login(dto);
  }

  @Get('auth/me')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Dados do operador logado no POS (VENDEDOR + DISTRIBUIDOR)',
  })
  me(@CurrentUser() user: RequestUser) {
    return {
      message: 'Operador autenticado',
      data: {
        perfil: user.perfil,
        cpf: user.cpf,
        vendedorId: user.vendedorId,
        distribuidorId: user.distribuidorId,
      },
    };
  }

  @Post('auth/logout')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout do POS (VENDEDOR + DISTRIBUIDOR) — sessão stateless',
    description:
      'O token é descartado no terminal. Não há revogação no servidor; basta logar outro operador.',
  })
  logout() {
    return { message: 'Logout realizado com sucesso', data: null };
  }

  // ─── Capital de Prêmios ───────────────────────────────────────────

  @Get('edicoes')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar edições ativas — Prêmios (VENDEDOR + DISTRIBUIDOR)' })
  listarEdicoes() {
    return this.posService.listarEdicoesAtivas();
  }

  @Get('edicoes/:edicaoId/combos')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Navegar combos disponíveis para POS — Prêmios (VENDEDOR + DISTRIBUIDOR)',
  })
  listarCombos(
    @Param('edicaoId', ParseUUIDPipe) edicaoId: string,
    @Query() filtros: ListarCombosAdminDto,
  ) {
    return this.posService.listarCombos(edicaoId, filtros);
  }

  @Post('vendas')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Criar venda PENDENTE — Prêmios, unitária ou combo (VENDEDOR + DISTRIBUIDOR)',
    description:
      'Cria a venda com origem POS sem cobrança interna. O pagamento é feito na maquininha e confirmado em /pos/vendas/:id/confirmar-pagamento.',
  })
  criarVenda(@Body() dto: CreatePosVendaDto, @CurrentUser() user: RequestUser) {
    return this.posService.criarVenda(dto, user);
  }

  @Post('vendas/:id/confirmar-pagamento')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirmar pagamento da maquininha e gerar cartelas — Prêmios (VENDEDOR + DISTRIBUIDOR)',
    description:
      'Recebe a resposta do PagBank, valida o pagamento e gera as cartelas; se não aprovado, marca a venda como RECUSADO.',
  })
  confirmarPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmarPagamentoPosDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.confirmarPagamento(id, dto, user);
  }

  // ─── Capital Sena ─────────────────────────────────────────────────

  @Get('capital-sena/edicoes')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar edições ativas — Sena (VENDEDOR + DISTRIBUIDOR)' })
  listarEdicoesSena() {
    return this.posService.listarEdicoesSenaAtivas();
  }

  @Post('capital-sena/vendas')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Criar venda PENDENTE — Sena, cartelas ou combo (VENDEDOR + DISTRIBUIDOR)',
    description:
      'Cria a venda Sena com origem POS sem cobrança interna. Confirmação em /pos/capital-sena/vendas/:id/confirmar-pagamento.',
  })
  criarVendaSena(
    @Body() dto: CreatePosVendaSenaDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.criarVendaSena(dto, user);
  }

  @Post('capital-sena/vendas/:id/confirmar-pagamento')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirmar pagamento da maquininha e gerar cartelas — Sena (VENDEDOR + DISTRIBUIDOR)',
    description:
      'Recebe a resposta do PagBank, valida o pagamento e gera as cartelas; se não aprovado, marca a venda como RECUSADO.',
  })
  confirmarPagamentoSena(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmarPagamentoPosDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.confirmarPagamentoSena(id, dto, user);
  }
}
