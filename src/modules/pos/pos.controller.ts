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
import { ReservarCartelasPosDto } from './dto/reservar-cartelas-pos.dto';
import { ListarCombosAdminDto } from '../vendas/dto/listar-combos-admin.dto';

const POS_AUTH_TAG = 'POS / Autenticação';
const POS_PREMIOS_TAG = 'POS / Prêmios';
const POS_SENA_TAG = 'POS / Capital Sena';

const POS_LOGIN_REQUEST_EXAMPLE = {
  cpf: '12345678900',
};

const POS_PREMIOS_VENDA_UNITARIA_REQUEST_EXAMPLE = {
  edicaoId: '8f52a4b8-1c4f-4e0b-8df6-95522f47a111',
  quantidadeCartelas: 2,
  tipoPagamento: 'PIX',
  cartelasSelecionadas: ['0276145', '0276146'],
  cpf: '98765432100',
  nome: 'Maria Cliente',
  telefone: '(11) 99999-9999',
  email: 'maria.cliente@email.com',
  dataNascimento: '1985-04-11',
};

const POS_PREMIOS_VENDA_COMBO_REQUEST_EXAMPLE = {
  edicaoId: '8f52a4b8-1c4f-4e0b-8df6-95522f47a111',
  tipoPagamento: 'PIX',
  combosSelecionados: ['0276145'],
  email: 'maria.cliente@email.com',
  cpf: '98765432100',
  nome: 'Maria Cliente',
  telefone: '(11) 99999-9999',
  dataNascimento: '1985-04-11',
};

const POS_PREMIOS_VENDA_MANUAL_REQUEST_EXAMPLE = {
  edicaoId: '8f52a4b8-1c4f-4e0b-8df6-95522f47a111',
  quantidadeCartelas: 2,
  tipoPagamento: 'MANUAL',
  cartelasSelecionadas: ['0276145', '0276146'],
  cpf: '98765432100',
  nome: 'Maria Cliente',
  telefone: '(11) 99999-9999',
  email: 'maria.cliente@email.com',
  dataNascimento: '1985-04-11',
};

const POS_SENA_VENDA_MANUAL_REQUEST_EXAMPLE = {
  edicaoSenaId: 'be5ec4b0-3d4e-46f0-9a6c-7bb85b99a111',
  tipoPagamento: 'PIX',
  cartelas: [
    {
      modoSelecao: 'MANUAL',
      numeros: [3, 12, 24, 37, 45, 58],
    },
  ],
  cpf: '98765432100',
  nome: 'Maria Cliente',
  telefone: '(11) 99999-9999',
  email: 'maria.cliente@email.com',
  dataNascimento: '1985-04-11',
};

const POS_SENA_VENDA_COMBO_REQUEST_EXAMPLE = {
  edicaoSenaId: 'be5ec4b0-3d4e-46f0-9a6c-7bb85b99a111',
  comboSenaId: 'fd2f8a0e-8ce6-4aa2-9c94-668c7530a111',
  tipoPagamento: 'PIX',
  cartelas: [
    { modoSelecao: 'SURPRESINHA' },
    { modoSelecao: 'SURPRESINHA' },
    { modoSelecao: 'SURPRESINHA' },
  ],
  cpf: '98765432100',
  nome: 'Maria Cliente',
  telefone: '(11) 99999-9999',
  dataNascimento: '1985-04-11',
};

/**
 * ## POS — Terminais de venda (Capital de Prêmios + Capital Sena)
 *
 * Canal exclusivo dos terminais físicos. Toda a operação do POS
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
 *    → GET /api/pos/edicoes/{edicaoId}/opcoes
 *    → GET /api/pos/edicoes/{edicaoId}/combos
 *    → POST /api/pos/edicoes/{edicaoId}/reservas
 *
 * 3. Criar a venda (PENDENTE) e gerar cobrança pela API
 *    → POST /api/pos/vendas                  (Prêmios)
 *    → POST /api/pos/capital-sena/vendas     (Sena)
 *    → retorna o id da venda + dados de pagamento PIX
 *
 * 4. Consultar status enquanto o webhook PagBank confirma a venda
 *    → GET /api/pos/vendas/{id}/pagamento
 *    → GET /api/pos/capital-sena/vendas/{id}/pagamento
 *
 * 5. Trocar de operador: logout (stateless) + novo login
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
 * O pagamento é processado pela API, igual ao fluxo WhatsApp/loja. A venda nasce
 * **PENDENTE**, a API cria a cobrança no PagBank e o webhook confirma a venda,
 * gerando as cartelas. Origem da venda é sempre `POS`.
 */
@Controller('pos')
export class PosController {
  constructor(
    private readonly posAuthService: PosAuthService,
    private readonly posService: PosService,
  ) {}

  // ─── 1. AUTENTICAÇÃO ──────────────────────────────────────────────

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiTags(POS_AUTH_TAG)
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
  @ApiBody({
    description: 'Login POS usa somente o CPF do operador. Não envie senha.',
    schema: {
      type: 'object',
      required: ['cpf'],
      properties: {
        cpf: {
          type: 'string',
          example: '12345678900',
          description:
            'CPF do operador do POS (VENDEDOR ou DISTRIBUIDOR). Somente números ou formatado.',
          pattern: '^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$',
        },
      },
      example: POS_LOGIN_REQUEST_EXAMPLE,
    },
    examples: {
      cpfSemMascara: {
        summary: 'CPF sem máscara',
        value: POS_LOGIN_REQUEST_EXAMPLE,
      },
      cpfFormatado: {
        summary: 'CPF formatado',
        value: { cpf: '123.456.789-00' },
      },
    },
  })
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
  @ApiTags(POS_AUTH_TAG)
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

  @Get('clientes/cpf/:cpf')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_PREMIOS_TAG)
  @ApiOperation({
    summary: '3. 🔒 Buscar dados do cliente por CPF para autofill no POS',
    description: `
Consulta um cliente já cadastrado para preencher automaticamente os campos da
venda no terminal POS. A busca respeita a hierarquia do operador autenticado:

- **VENDEDOR** só enxerga clientes vinculados a ele
- **DISTRIBUIDOR** só enxerga clientes da sua rede

Se o cliente não existir, a API retorna \`encontrado: false\` para o terminal
seguir com preenchimento manual.
    `.trim(),
  })
  @ApiParam({
    name: 'cpf',
    description: 'CPF do cliente com ou sem máscara.',
    example: '12345678900',
  })
  @ApiResponse({
    status: 200,
    description: 'Consulta concluída.',
    schema: {
      examples: {
        encontrado: {
          summary: 'Cliente encontrado',
          value: {
            statusCode: 200,
            message: 'Cliente encontrado com sucesso',
            data: {
              encontrado: true,
              cliente: {
                id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                cpf: '12345678900',
                nome: 'Maria Cliente',
                telefone: '(11) 99999-9999',
                email: 'maria.cliente@email.com',
                dataNascimento: '1985-04-11',
                cidade: 'São Paulo',
                estado: 'SP',
              },
            },
          },
        },
        naoEncontrado: {
          summary: 'Cliente não encontrado',
          value: {
            statusCode: 200,
            message: 'Cliente não encontrado',
            data: {
              encontrado: false,
              cliente: null,
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado.' })
  buscarClientePorCpf(
    @Param('cpf') cpf: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.buscarClientePorCpf(cpf, user);
  }

  @Post('auth/logout')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiTags(POS_AUTH_TAG)
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
  @ApiTags(POS_PREMIOS_TAG)
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

  @Get('edicoes/:edicaoId/opcoes')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_PREMIOS_TAG)
  @ApiOperation({
    summary:
      '5. 🔒 Listar opções configuradas — Prêmios (unitário e combos)',
    description: `
Lista as opções de venda configuradas para o canal **POS** na edição: compra
unitária e combos, com quantidade de cartelas e preço. Use este endpoint para
montar a tela de escolha antes de navegar/reservar cartelas.

Para itens do tipo **COMBO**, o campo \`id\` retornado nesta lista é o
\`comboId\` que deve ser enviado em \`POST /pos/vendas\`.
    `.trim(),
  })
  @ApiParam({
    name: 'edicaoId',
    description: 'ID da edição ativa (obtido em GET /pos/edicoes)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Opções configuradas listadas.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Opções de venda POS listadas com sucesso',
        data: {
          edicaoId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          edicaoNumero: '001',
          origemParticipacao: 'POS',
          opcoes: [
            {
              tipoCompra: 'UNITARIO',
              tipoCartela: 'UMA_CHANCE',
              quantidadeCartelas: 1,
              preco: '10.00',
              indiceRange: 1,
            },
            {
              tipoCompra: 'COMBO',
              id: 'f3d6cb09-4f2e-437c-8d4e-e32cfd0aa111',
              tipoCartela: 'TRES_CHANCES',
              quantidadeCartelas: 3,
              preco: '25.00',
              indiceRange: null,
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({ status: 404, description: 'Edição não encontrada.' })
  listarOpcoes(@Param('edicaoId', ParseUUIDPipe) edicaoId: string) {
    return this.posService.listarOpcoesVenda(edicaoId);
  }

  @Get('edicoes/:edicaoId/combos')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_PREMIOS_TAG)
  @ApiOperation({
    summary:
      '6. 🔒 Navegar cartelas/combos disponíveis — Prêmios',
    description: `
Lista os combos/cotas disponíveis (1 por vez, navegação por cursor). A venda POS
usa a configuração **DIGITAL** de ranges e preços e ignora cartelas já vendidas ou
reservadas em pré-compra.
    `.trim(),
  })
  @ApiParam({
    name: 'edicaoId',
    description: 'ID da edição ativa (obtido em GET /pos/edicoes)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiQuery({
    name: 'tipoCartela',
    required: false,
    enum: [
      'UMA_CHANCE',
      'DUAS_CHANCES',
      'TRES_CHANCES',
      'QUATRO_CHANCES',
      'CINCO_CHANCES',
      'SEIS_CHANCES',
      'SETE_CHANCES',
      'OITO_CHANCES',
      'NOVE_CHANCES',
      'DEZ_CHANCES',
      'ONZE_CHANCES',
      'DOZE_CHANCES',
    ],
    example: 'DUAS_CHANCES',
    description:
      'Tipo de cartela do combo. Corresponde à quantidade de cartelas: DUAS_CHANCES = 2 cartelas, TRES_CHANCES = 3, etc. Pode ser omitido e usar quantidadeCartelas no lugar.',
  })
  @ApiQuery({
    name: 'quantidadeCartelas',
    required: false,
    type: Number,
    example: 3,
    description: 'Quantidade de cartelas do combo. Se omitida, assume 1.',
  })
  @ApiQuery({
    name: 'cursorNumeroBase',
    required: false,
    type: String,
    example: '0276145',
    description: 'Número base atual para buscar próximo/anterior.',
  })
  @ApiQuery({
    name: 'direcao',
    required: false,
    enum: ['PROXIMO', 'ANTERIOR'],
    example: 'PROXIMO',
    description: 'Direção da navegação por combos.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Combos/cotas disponíveis listados. A API retorna 1 combo por chamada para navegação por cursor.',
    schema: {
      examples: {
        comboDisponivel: {
          summary: 'Combo disponível',
          value: {
            statusCode: 200,
            message: 'Combos disponíveis listados com sucesso',
            data: {
              edicaoId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              edicaoNumero: '001',
              status: 'ATIVA',
              origemParticipacao: 'POS',
              tipoCompra: 'COMBO',
              quantidadeCartelas: 3,
              valorUnitarioCartela: '10.00',
              valorCombo: '25.00',
              preco: '25.00',
              passoEntreCartelas: '100000',
              rangeTotalInicio: '0000001',
              rangeTotalFinal: '0999999',
              setores: [
                {
                  indiceCartela: 1,
                  rangeInicio: '0000001',
                  rangeFinal: '0099999',
                },
                {
                  indiceCartela: 2,
                  rangeInicio: '0100001',
                  rangeFinal: '0199999',
                },
                {
                  indiceCartela: 3,
                  rangeInicio: '0200001',
                  rangeFinal: '0299999',
                },
              ],
              cursorNumeroBaseAtual: '0276145',
              combos: [
                {
                  ordemSequencia: 1,
                  numeroBase: '0276145',
                  bilhetes: [
                    {
                      ordem: 1,
                      matrizId: 'f8b47a58-0f02-4c8d-9d3e-822c3e9e1111',
                      numero: '0276145',
                      sequenciaBolas: [4, 12, 23, 31, 42, 55],
                    },
                    {
                      ordem: 2,
                      matrizId: 'b4af2dd7-9c97-4ed5-87e7-c4f6b3011111',
                      numero: '0376145',
                      sequenciaBolas: [7, 14, 21, 36, 48, 59],
                    },
                    {
                      ordem: 3,
                      matrizId: '9e71e73a-b72d-4a6f-81fe-cc5d8d911111',
                      numero: '0476145',
                      sequenciaBolas: [2, 10, 18, 29, 41, 53],
                    },
                  ],
                },
              ],
              comboAtual: {
                numeroBase: '0276145',
                bilhetes: [
                  {
                    ordem: 1,
                    matrizId: 'f8b47a58-0f02-4c8d-9d3e-822c3e9e1111',
                    numero: '0276145',
                    sequenciaBolas: [4, 12, 23, 31, 42, 55],
                  },
                  {
                    ordem: 2,
                    matrizId: 'b4af2dd7-9c97-4ed5-87e7-c4f6b3011111',
                    numero: '0376145',
                    sequenciaBolas: [7, 14, 21, 36, 48, 59],
                  },
                  {
                    ordem: 3,
                    matrizId: '9e71e73a-b72d-4a6f-81fe-cc5d8d911111',
                    numero: '0476145',
                    sequenciaBolas: [2, 10, 18, 29, 41, 53],
                  },
                ],
              },
            },
          },
        },
        semComboConfigurado: {
          summary: 'Nenhum combo configurado/disponível',
          value: {
            statusCode: 200,
            message: 'Nenhum combo configurado para esta seleção',
            data: {
              edicaoId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              edicaoNumero: '001',
              status: 'ATIVA',
              origemParticipacao: 'POS',
              tipoCompra: 'COMBO',
              quantidadeCartelas: 0,
              valorUnitarioCartela: '10.00',
              valorCombo: null,
              preco: null,
              passoEntreCartelas: '0',
              rangeTotalInicio: '0',
              rangeTotalFinal: '0',
              setores: [],
              cursorNumeroBaseAtual: null,
              combos: [],
              comboAtual: null,
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({ status: 404, description: 'Edição não encontrada.' })
  listarCombos(
    @Param('edicaoId', ParseUUIDPipe) edicaoId: string,
    @Query() filtros: ListarCombosAdminDto,
  ) {
    return this.posService.listarCombos(edicaoId, filtros);
  }

  @Post('edicoes/:edicaoId/reservas')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_PREMIOS_TAG)
  @ApiOperation({
    summary:
      '7. 🔒 Reservar cartelas/combos para pré-compra — Prêmios',
    description: `
Marca as cartelas escolhidas como **pré-compra** por 5 minutos para o operador
do POS. Para combo, envie todos os números de \`comboAtual.bilhetes\` retornados
em \`GET /pos/edicoes/{edicaoId}/combos\`.

Depois da reserva, crie a venda com \`cartelasSelecionadas\` ou
\`combosSelecionados\`. A API valida que a seleção ainda pertence ao operador e
estende a reserva durante a cobrança PIX.
    `.trim(),
  })
  @ApiParam({
    name: 'edicaoId',
    description: 'ID da edição ativa (obtido em GET /pos/edicoes)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: ReservarCartelasPosDto })
  @ApiResponse({
    status: 201,
    description: 'Cartelas reservadas para pré-compra.',
    schema: {
      example: {
        statusCode: 201,
        message: 'Cartelas reservadas para pré-compra POS',
        data: {
          edicaoId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          edicaoNumero: '001',
          reservadas: 3,
          cartelas: ['0276145', '0376145', '0476145'],
          expiresIn: 300,
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Alguma cartela já foi vendida ou reservada por outro POS.',
  })
  @ApiResponse({
    status: 503,
    description: 'Redis não configurado para controlar reservas POS.',
  })
  reservarCartelas(
    @Param('edicaoId', ParseUUIDPipe) edicaoId: string,
    @Body() dto: ReservarCartelasPosDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.reservarCartelas(edicaoId, dto, user);
  }

  // ─── 3. PRÊMIOS — VENDA E PAGAMENTO ───────────────────────────────

  @Post('vendas')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_PREMIOS_TAG)
  @ApiOperation({
    summary:
      '8. 🔒 Criar venda POS — Prêmios (VENDEDOR + DISTRIBUIDOR)',
    description: `
Cria a venda com origem **POS**. O vendedor/distribuidor é definido pelo token
(não envie no corpo).

**Compra unitária:** informe \`quantidadeCartelas\` (e opcionalmente
\`cartelasSelecionadas\`).
**Combo:** informe \`comboId\` ou \`combosSelecionados\`.
**Pagamento PIX:** cria a venda como \`PENDENTE\` e gera a cobrança no gateway,
retornando \`pixCopiaECola\`/QR Code em \`pagamento\`.
**Pagamento MANUAL:** aprova a venda imediatamente, sem passar pelo gateway.

Guarde o \`id\` retornado: ele pode ser usado para consultar status em
\`GET /pos/vendas/{id}/pagamento\`. O terminal deve fazer polling a cada
3–5 segundos até \`pago=true\` ou \`status\` ∈ { \`APROVADO\`, \`RECUSADO\`,
\`CANCELADO\` }.
    `.trim(),
  })
  @ApiBody({
    type: CreatePosVendaDto,
    description:
      'Request da venda POS de Prêmios. Não envie vendedorId, distribuidorId nem origemParticipacao; a API resolve pelo token POS e força origem POS.',
    examples: {
      vendaUnitaria: {
        summary: 'Venda unitária com cartelas selecionadas',
        value: POS_PREMIOS_VENDA_UNITARIA_REQUEST_EXAMPLE,
      },
      vendaCombo: {
        summary: 'Venda por combo selecionado',
        value: POS_PREMIOS_VENDA_COMBO_REQUEST_EXAMPLE,
      },
      vendaManual: {
        summary: 'Venda manual já paga na maquininha',
        value: POS_PREMIOS_VENDA_MANUAL_REQUEST_EXAMPLE,
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Venda criada com sucesso. Em PIX fica PENDENTE; em MANUAL já retorna APROVADO.',
    schema: {
      examples: {
        pix: {
          summary: 'Venda PIX pendente',
          value: {
            statusCode: 201,
            message: 'Venda criada com sucesso',
            data: {
              id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
              status: 'PENDENTE',
              origemParticipacao: 'POS',
              total: '20.00',
              pagamento: {
                pixCopiaECola: '00020126580014br.gov.bcb.pix0136...',
                qrCodeBase64: 'https://assets.pagseguro.com.br/qrcode/...',
                urlPagamento: 'https://assets.pagseguro.com.br/qrcode/...',
              },
            },
          },
        },
        manual: {
          summary: 'Venda manual aprovada na hora',
          value: {
            statusCode: 201,
            message: 'Venda criada com sucesso',
            data: {
              id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
              status: 'APROVADO',
              origemParticipacao: 'POS',
              total: '20.00',
              pagamento: {},
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Edição inativa ou dados inválidos.' })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  criarVenda(@Body() dto: CreatePosVendaDto, @CurrentUser() user: RequestUser) {
    return this.posService.criarVenda(dto, user);
  }

  @Get('vendas/:id/pagamento')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_PREMIOS_TAG)
  @ApiOperation({
    summary:
      '9. 🔒 Consultar status do pagamento — Prêmios (VENDEDOR + DISTRIBUIDOR)',
    description: `
Consulta o status interno da venda e, quando houver \`gatewayId\`, consulta o
status atual no gateway. A aprovação definitiva ocorre pelo webhook PagBank.

**Polling do POS:** chame este endpoint a cada 3–5 segundos após criar a venda.
Pare quando \`pago=true\` ou quando \`status\` for \`APROVADO\`, \`RECUSADO\` ou
\`CANCELADO\`.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID da venda (retornado em POST /pos/vendas)',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do pagamento consultado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Status do pagamento POS consultado',
        data: {
          vendaId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          status: 'PENDENTE',
          statusLabel: 'Aguardando pagamento',
          statusGateway: 'PENDENTE',
          total: '20.00',
          criadoEm: '2026-05-28T14:30:00.000Z',
          pago: false,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 403,
    description: 'Venda não pertence a este operador.',
  })
  @ApiResponse({ status: 404, description: 'Venda POS não encontrada.' })
  consultarPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.consultarStatusPagamento(id, user);
  }

  // ─── 4. SENA — EDIÇÕES, VENDA E PAGAMENTO ─────────────────────────

  @Get('capital-sena/edicoes')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_SENA_TAG)
  @ApiOperation({
    summary: '10. 🔒 Listar edições ativas — Sena (VENDEDOR + DISTRIBUIDOR)',
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
  @ApiTags(POS_SENA_TAG)
  @ApiOperation({
    summary:
      '11. 🔒 Criar venda POS e gerar cobrança — Sena (VENDEDOR + DISTRIBUIDOR)',
    description: `
Cria a venda Sena com origem **POS**, status **PENDENTE** e cobrança no gateway
pela própria API.
Informe as \`cartelas\` (MANUAL com 6 números, ou SURPRESINHA) e, opcionalmente,
\`comboSenaId\`. O vendedor/distribuidor vem do token.

Guarde o \`id\` para consultar status em
\`GET /pos/capital-sena/vendas/{id}/pagamento\`. O terminal deve fazer polling a
cada 3–5 segundos até \`pago=true\` ou \`status\` ∈ { \`APROVADO\`,
\`RECUSADO\`, \`CANCELADO\` }.
    `.trim(),
  })
  @ApiBody({
    type: CreatePosVendaSenaDto,
    description:
      'Request da venda POS do Capital Sena. Não envie vendedorId, distribuidorId nem seller_id; a API resolve pelo token POS.',
    examples: {
      vendaManual: {
        summary: 'Venda manual com números escolhidos',
        value: POS_SENA_VENDA_MANUAL_REQUEST_EXAMPLE,
      },
      vendaComboSurpresinha: {
        summary: 'Venda combo com Surpresinha',
        value: POS_SENA_VENDA_COMBO_REQUEST_EXAMPLE,
      },
    },
  })
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
          pagamento: {
            pixCopiaECola: '00020126580014br.gov.bcb.pix0136...',
            qrCodeBase64: 'https://assets.pagseguro.com.br/qrcode/...',
            urlPagamento: 'https://assets.pagseguro.com.br/qrcode/...',
          },
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

  @Get('capital-sena/vendas/:id/pagamento')
  @UseGuards(PosAuthGuard)
  @ApiBearerAuth()
  @ApiTags(POS_SENA_TAG)
  @ApiOperation({
    summary:
      '12. 🔒 Consultar status do pagamento — Sena (VENDEDOR + DISTRIBUIDOR)',
    description: `
Consulta o status interno da venda Sena e, quando houver \`gatewayId\`, consulta
o status atual no gateway. A aprovação definitiva ocorre pelo webhook PagBank.

**Polling do POS:** chame este endpoint a cada 3–5 segundos após criar a venda
Sena. Pare quando \`pago=true\` ou quando \`status\` for \`APROVADO\`,
\`RECUSADO\` ou \`CANCELADO\`.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID da venda Sena (retornado em POST /pos/capital-sena/vendas)',
    example: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do pagamento Sena consultado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Status do pagamento POS Sena consultado',
        data: {
          vendaId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
          status: 'PENDENTE',
          statusLabel: 'Aguardando pagamento',
          statusGateway: 'PENDENTE',
          total: '12.00',
          criadoEm: '2026-05-28T14:30:00.000Z',
          pago: false,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 403,
    description: 'Venda não pertence a este operador.',
  })
  @ApiResponse({ status: 404, description: 'Venda Sena POS não encontrada.' })
  consultarPagamentoSena(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.posService.consultarStatusPagamentoSena(id, user);
  }
}
