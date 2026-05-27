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
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
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
 * Canal exclusivo das maquininhas/terminais físicos. Toda a operação do POS
 * vive aqui — não use as rotas de `/admin/vendas` nem `/capital-sena` para POS.
 *
 * ---
 *
 * ### Fluxo recomendado
 *
 * ```
 * 1. Login do operador por CPF (VENDEDOR ou DISTRIBUIDOR)
 *    → POST /api/pos/auth/login   → retorna accessToken (sessão longa)
 *
 * 2. (Prêmios) Listar edições ativas e navegar combos
 *    → GET /api/pos/edicoes
 *    → GET /api/pos/edicoes/{edicaoId}/combos
 *
 * 3. Criar a venda (PENDENTE) — unitária ou combo
 *    → POST /api/pos/vendas                  (Prêmios)
 *    → POST /api/pos/capital-sena/vendas     (Sena)
 *    → retorna o id da venda (pedido)
 *
 * 4. Maquininha processa o pagamento (PagBank) e devolve o resultado
 *
 * 5. Confirmar o pagamento → valida e gera as cartelas (ou recusa)
 *    → POST /api/pos/vendas/{id}/confirmar-pagamento
 *    → POST /api/pos/capital-sena/vendas/{id}/confirmar-pagamento
 *
 * 6. Trocar de operador: logout (stateless) + novo login
 *    → POST /api/pos/auth/logout
 * ```
 *
 * ---
 *
 * ### Autenticação
 * Login só por CPF (sem senha), exclusivo para VENDEDOR e DISTRIBUIDOR. O token
 * tem expiração longa (`JWT_POS_EXPIRES`) e secret isolado do painel admin — um
 * token POS **não** acessa as rotas administrativas. Use o `accessToken` no
 * header `Authorization: Bearer {accessToken}` nas rotas marcadas com 🔒.
 *
 * ### Pagamento
 * O pagamento é processado na maquininha; a venda nasce **PENDENTE** e só vira
 * **APROVADO** (gerando as cartelas) quando o resultado do PagBank é enviado em
 * `confirmar-pagamento`. Origem da venda é sempre `POS`, e a configuração de
 * ranges/preços reutiliza a do canal DIGITAL.
 */
@ApiTags('POS')
@Controller('pos')
export class PosController {
  constructor(
    private readonly posAuthService: PosAuthService,
    private readonly posService: PosService,
  ) {}

  // ─── 1. AUTENTICAÇÃO ──────────────────────────────────────────────

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '1. Login do POS por CPF (VENDEDOR + DISTRIBUIDOR) — sem senha',
    description: `
Autentica o operador do terminal **apenas pelo CPF** (sem senha) e emite um token
de sessão longa. Aceita perfis **VENDEDOR** e **DISTRIBUIDOR**.

O vínculo do operador (vendedorId/distribuidorId) é resolvido pelo CPF e fica
embutido no token — as vendas criadas no terminal são automaticamente atribuídas
a ele.
    `.trim(),
  })
  @ApiBody({ type: LoginPosDto })
  @ApiResponse({
    status: 200,
    description: 'Operador autenticado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Login realizado com sucesso',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          perfil: 'VENDEDOR',
          operador: {
            nome: 'João Vendedor',
            cpf: '12345678900',
            perfil: 'VENDEDOR',
            vendedorId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            distribuidorId: undefined,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'CPF não vinculado a vendedor/distribuidor, ou operador inativo.',
  })
  login(@Body() dto: LoginPosDto) {
    return this.posAuthService.login(dto);
  }

  @Get('auth/me')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '2. 🔒 Dados do operador logado (VENDEDOR + DISTRIBUIDOR)',
    description: 'Retorna o operador atual do token — útil para o cabeçalho do terminal.',
  })
  @ApiResponse({
    status: 200,
    description: 'Operador autenticado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Operador autenticado',
        data: {
          perfil: 'VENDEDOR',
          cpf: '12345678900',
          vendedorId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          distribuidorId: undefined,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado.' })
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
    summary: '3. 🔒 Logout do POS (VENDEDOR + DISTRIBUIDOR) — sessão stateless',
    description: `
Encerra a sessão no terminal. O token é **descartado no cliente** (stateless, sem
revogação no servidor). Para trocar de operador, basta chamar este endpoint e
fazer um novo \`POST /pos/auth/login\`.
    `.trim(),
  })
  @ApiResponse({
    status: 200,
    description: 'Logout efetuado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Logout realizado com sucesso',
        data: null,
      },
    },
  })
  logout() {
    return { message: 'Logout realizado com sucesso', data: null };
  }

  // ─── 2. PRÊMIOS — EDIÇÕES E COMBOS ────────────────────────────────

  @Get('edicoes')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '4. 🔒 Listar edições ativas — Prêmios (VENDEDOR + DISTRIBUIDOR)',
    description: 'Edições com status ATIVA disponíveis para venda no terminal.',
  })
  @ApiResponse({
    status: 200,
    description: 'Edições ativas.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Edições ativas listadas com sucesso',
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            numero: '001',
            frase: 'Participe e ganhe!',
            imagemUrl: 'https://cdn.exemplo.com/edicao-001.jpg',
            valorCartela: '10.00',
            dataSorteio: '2026-06-01T15:00:00.000Z',
            dataEncerramento: '2026-05-31T23:59:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  listarEdicoes() {
    return this.posService.listarEdicoesAtivas();
  }

  @Get('edicoes/:edicaoId/combos')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '5. 🔒 Navegar combos disponíveis — Prêmios (VENDEDOR + DISTRIBUIDOR)',
    description: `
Lista os combos/cotas disponíveis (1 por vez, navegação por cursor). A venda POS
reutiliza a configuração **DIGITAL** de ranges e preços.
    `.trim(),
  })
  @ApiParam({
    name: 'edicaoId',
    description: 'ID da edição ativa (obtido em GET /pos/edicoes)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiQuery({ name: 'tipoCartela', required: false })
  @ApiQuery({ name: 'quantidadeCartelas', required: false, type: Number })
  @ApiQuery({ name: 'cursorNumeroBase', required: false, type: String })
  @ApiQuery({ name: 'direcao', required: false, enum: ['PROXIMO', 'ANTERIOR'] })
  @ApiResponse({ status: 200, description: 'Combos disponíveis listados.' })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({ status: 404, description: 'Edição não encontrada.' })
  listarCombos(
    @Param('edicaoId', ParseUUIDPipe) edicaoId: string,
    @Query() filtros: ListarCombosAdminDto,
  ) {
    return this.posService.listarCombos(edicaoId, filtros);
  }

  // ─── 3. PRÊMIOS — VENDA E CONFIRMAÇÃO ─────────────────────────────

  @Post('vendas')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '6. 🔒 Criar venda PENDENTE — Prêmios, unitária ou combo (VENDEDOR + DISTRIBUIDOR)',
    description: `
Cria a venda com origem **POS** e status **PENDENTE**, **sem cobrança interna** — o
pagamento é feito na maquininha. O vendedor/distribuidor é definido pelo token
(não envie no corpo).

**Compra unitária:** informe \`quantidadeCartelas\` (e opcionalmente
\`cartelasSelecionadas\`).
**Combo:** informe \`comboId\` ou \`combosSelecionados\`.

Guarde o \`id\` retornado: ele é usado no \`confirmar-pagamento\`.
    `.trim(),
  })
  @ApiBody({ type: CreatePosVendaDto })
  @ApiResponse({
    status: 201,
    description: 'Venda criada (PENDENTE), aguardando confirmação de pagamento.',
    schema: {
      example: {
        statusCode: 201,
        message: 'Venda criada com sucesso',
        data: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          status: 'PENDENTE',
          origemParticipacao: 'POS',
          total: '20.00',
          pagamento: {},
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Edição inativa ou dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  criarVenda(@Body() dto: CreatePosVendaDto, @CurrentUser() user: RequestUser) {
    return this.posService.criarVenda(dto, user);
  }

  @Post('vendas/:id/confirmar-pagamento')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '7. 🔒 Confirmar pagamento e gerar cartelas — Prêmios (VENDEDOR + DISTRIBUIDOR)',
    description: `
Recebe a resposta de pagamento da maquininha (PagBank), **valida** e:
- se aprovado → confirma a venda e **gera as cartelas** (status APROVADO);
- se não aprovado → marca a venda como **RECUSADO** e **não** gera cartelas.

> A validação no PagBank é um ponto de extensão; hoje considera aprovado quando
> \`status\` ∈ { PAID, APPROVED, APROVADO }.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID da venda PENDENTE (retornado em POST /pos/vendas)',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiBody({ type: ConfirmarPagamentoPosDto })
  @ApiResponse({
    status: 200,
    description: 'Pagamento processado (aprovado ou recusado).',
    schema: {
      example: {
        statusCode: 200,
        message: 'Pagamento confirmado com sucesso',
        data: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          status: 'APROVADO',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 403,
    description: 'Venda já processada ou não pertence a este operador.',
  })
  @ApiResponse({ status: 404, description: 'Venda POS não encontrada.' })
  confirmarPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmarPagamentoPosDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.confirmarPagamento(id, dto, user);
  }

  // ─── 4. SENA — EDIÇÕES, VENDA E CONFIRMAÇÃO ───────────────────────

  @Get('capital-sena/edicoes')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '8. 🔒 Listar edições ativas — Sena (VENDEDOR + DISTRIBUIDOR)',
    description: 'Edições Sena ativas, com os combos disponíveis.',
  })
  @ApiResponse({
    status: 200,
    description: 'Edições Sena ativas.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Edições Sena ativas listadas com sucesso',
        data: [
          {
            id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            numero: '2026-15',
            valorCartela: '5.00',
            dataSorteioMegaSena: '2026-06-05T20:00:00.000Z',
            dataEncerramento: '2026-06-05T18:00:00.000Z',
            combos: [
              { id: 'combo-1', nome: 'Combo 3 cartelas', quantidade: 3, preco: '12.00' },
            ],
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  listarEdicoesSena() {
    return this.posService.listarEdicoesSenaAtivas();
  }

  @Post('capital-sena/vendas')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      '9. 🔒 Criar venda PENDENTE — Sena, cartelas ou combo (VENDEDOR + DISTRIBUIDOR)',
    description: `
Cria a venda Sena com origem **POS** e status **PENDENTE**, sem cobrança interna.
Informe as \`cartelas\` (MANUAL com 6 números, ou SURPRESINHA) e, opcionalmente,
\`comboSenaId\`. O vendedor/distribuidor vem do token.

Guarde o \`id\` para a etapa de \`confirmar-pagamento\`.
    `.trim(),
  })
  @ApiBody({ type: CreatePosVendaSenaDto })
  @ApiResponse({
    status: 201,
    description: 'Venda Sena criada (PENDENTE).',
    schema: {
      example: {
        statusCode: 201,
        message: 'Venda Sena criada com sucesso',
        data: {
          id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
          status: 'PENDENTE',
          quantidade: 3,
          total: '12.00',
          pagamento: {},
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Edição inativa ou cartelas inválidas.' })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
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
      '10. 🔒 Confirmar pagamento e gerar cartelas — Sena (VENDEDOR + DISTRIBUIDOR)',
    description: `
Recebe a resposta de pagamento da maquininha (PagBank), valida e gera as cartelas
(com o 7º número) se aprovado; caso contrário marca a venda como **RECUSADO**.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID da venda Sena PENDENTE (retornado em POST /pos/capital-sena/vendas)',
    example: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  })
  @ApiBody({ type: ConfirmarPagamentoPosDto })
  @ApiResponse({
    status: 200,
    description: 'Pagamento Sena processado (aprovado ou recusado).',
    schema: {
      example: {
        statusCode: 200,
        message: 'Pagamento Sena confirmado',
        data: { id: 'd4e5f6a7-b8c9-0123-defa-234567890123', status: 'APROVADO' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 403,
    description: 'Venda já processada ou não pertence a este operador.',
  })
  @ApiResponse({ status: 404, description: 'Venda Sena POS não encontrada.' })
  confirmarPagamentoSena(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmarPagamentoPosDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.confirmarPagamentoSena(id, dto, user);
  }
}
