import {
  Body,
  Controller,
  Get,
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
import { WhatsappApiService } from './whatsapp-api.service';
import { AuthWhatsappDto } from './dto/auth-whatsapp.dto';
import { CriarPedidoWhatsappDto } from './dto/criar-pedido-whatsapp.dto';
import { CriarPedidoSenaWhatsappDto } from './dto/criar-pedido-sena-whatsapp.dto';
import { PreviewCotasWhatsappDto } from './dto/preview-cotas-whatsapp.dto';
import { ConsultarPedidosWhatsappDto } from './dto/consultar-pedidos-whatsapp.dto';
import { ReservarCartelasWhatsappDto } from './dto/reservar-cartelas-whatsapp.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

const WHATSAPP_GERAL_TAG = 'WhatsApp API — Geral';
const WHATSAPP_PREMIOS_TAG = 'WhatsApp API — Capital de Prêmios';
const WHATSAPP_SENA_TAG = 'WhatsApp API — Capital Sena';

/**
 * ## WhatsApp API — Guia de Integração
 *
 * Esta collection é destinada a **bots e CRMs** que operam via WhatsApp
 * para vender bilhetes da Capital de Prêmios de forma automatizada.
 *
 * ---
 *
 * ### Fluxo recomendado
 *
 * ```
 * 1. Autenticar/registrar o cliente por CPF
 *    → POST /api/whatsapp/auth
 *    → Retorna: accessToken (JWT Bearer)
 *
 * 2. Consultar a campanha ativa
 *    → GET /api/whatsapp/campanhas/ativa
 *    → Retorna: id da edição, preços, prêmios, deadline
 *
 * 3. (Opcional) Gerar preview das cotas disponíveis
 *    → POST /api/whatsapp/campanhas/{id}/cotas/preview
 *    → Retorna: combos com números disponíveis (já exclui números reservados)
 *
 * 3b. (Recomendado para combos) Reservar a seleção por 5 minutos
 *    → POST /api/whatsapp/campanhas/{id}/reservas  [Bearer]
 *    → Trava os números escolhidos para este cliente — mesmo esquema do POS
 *
 * 4. Criar o pedido e receber o QR Code / Copia-e-Cola PIX
 *    → POST /api/whatsapp/pedidos  [Bearer]
 *    → Retorna: pedidoId + pixCopiaECola + qrCodeUrl
 *    → Se a seleção foi reservada no passo 3b, a reserva é estendida automaticamente
 *
 * 5. Enviar o código PIX ao cliente via WhatsApp e aguardar pagamento
 *
 * 6. Consultar status do pagamento
 *    → GET /api/whatsapp/pedidos/{id}/pagamento  [Bearer]
 *    → Retorna: status (PENDENTE / APROVADO / CANCELADO)
 *
 * 7. Após APROVADO — retornar as cartelas com os números sorteados
 *    → GET /api/whatsapp/pedidos/{id}/cartelas  [Bearer]
 *    → Retorna: lista de cartelas com números e sequência de bolas
 *
 * 8. Consultar pedidos anteriores do cliente
 *    → GET /api/whatsapp/pedidos  [Bearer]
 * ```
 *
 * ---
 *
 * ### Capital Sena
 *
 * Usa a **mesma autenticação** (`POST /api/whatsapp/auth`) e o **mesmo webhook**
 * de pagamento do fluxo acima — apenas as rotas de campanha/pedido têm o
 * prefixo `/sena`:
 *
 * ```
 * 1. GET  /api/whatsapp/sena/campanhas/ativa
 * 2. POST /api/whatsapp/sena/pedidos                  [Bearer]
 * 3. GET  /api/whatsapp/sena/pedidos/{id}/pagamento    [Bearer]
 * 4. GET  /api/whatsapp/sena/pedidos/{id}/cartelas     [Bearer]
 * 5. GET  /api/whatsapp/sena/pedidos                   [Bearer]
 * ```
 *
 * ---
 *
 * ### Autenticação
 *
 * Após o `POST /api/whatsapp/auth`, use o `accessToken` retornado
 * no header `Authorization: Bearer {accessToken}` em todas as rotas
 * marcadas com 🔒.
 *
 * ---
 *
 * ### Webhook de confirmação de pagamento
 *
 * Configure a URL `POST /api/whatsapp/webhook/pagamento` no painel
 * do PagBank para receber notificações de pagamento confirmado.
 * Esta rota **não** exige autenticação JWT e vale tanto para Prêmios
 * quanto para Capital Sena — a confirmação é resolvida pelo gatewayId.
 */
@Controller('whatsapp')
export class WhatsappApiController {
  constructor(private readonly service: WhatsappApiService) {}

  // ─── 1. AUTENTICAÇÃO / CADASTRO ───────────────────────────────────────────

  @Post('auth')
  @ApiTags(WHATSAPP_GERAL_TAG)
  @ApiOperation({
    summary: '1. Registrar ou autenticar cliente por CPF',
    description: `
Registra um novo cliente ou autentica um cliente existente usando o CPF como identificador único.

**Comportamento:**
- **CPF novo:** cria o cadastro e retorna o JWT.
- **CPF existente:** atualiza nome e telefone e retorna o JWT.

**Por que telefone é obrigatório?**
O telefone é necessário pois é o canal de origem (WhatsApp) e também usado para consultar pedidos futuros.

**Retorno:** \`accessToken\` (JWT válido por 15 min) + \`refreshToken\` (válido por 7 dias).
    `.trim(),
  })
  @ApiBody({ type: AuthWhatsappDto })
  @ApiResponse({
    status: 200,
    description: 'Cliente autenticado/registrado com sucesso.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Autenticação realizada com sucesso',
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          perfil: 'CLIENTE',
          cliente: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            nome: 'João da Silva',
            cpf: '123.***.***-00',
            telefone: '61999999999',
            email: null,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos (CPF, telefone, etc.).',
  })
  auth(@Body() dto: AuthWhatsappDto) {
    return this.service.autenticarOuCriar(dto);
  }

  // ─── 2. CAMPANHA ATIVA ────────────────────────────────────────────────────

  @Get('campanhas/ativa')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiOperation({
    summary: '2. Consultar campanha/edição ativa',
    description: `
Retorna os dados completos da campanha de sorteio ativa no momento.

**Uso:** O bot deve chamar esta rota para obter o \`id\` da edição (necessário para criar pedidos)
e as opções de compra disponíveis (tipos de cartela e preços).

Se não houver campanha ativa, retorna \`data: null\`.
    `.trim(),
  })
  @ApiResponse({
    status: 200,
    description: 'Campanha ativa retornada (ou null se não houver).',
    schema: {
      example: {
        statusCode: 200,
        message: 'Campanha ativa encontrada',
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          numero: '001',
          titulo: 'Edição 001',
          frase: 'Participe e ganhe!',
          imagemUrl: 'https://cdn.exemplo.com/edicao-001.jpg',
          status: 'ATIVA',
          dataSorteio: '2026-06-01T15:00:00.000Z',
          dataEncerramento: '2026-05-31T23:59:00.000Z',
          valorCartela: '10.00',
          valorUnitarioCartela: '10.00',
          qtdNumerosCartela: 15,
          opcoesCompra: [
            {
              tipoCompra: 'UNITARIO',
              isCombo: false,
              quantidadeCartelas: 1,
              valorUnitarioCartela: '10.00',
              valorUnitario: '10.00',
              valorCombo: null,
              preco: '10.00',
              precoFormatado: 'R$ 10,00',
            },
            {
              tipoCompra: 'COMBO',
              isCombo: true,
              quantidadeCartelas: 6,
              valorUnitarioCartela: '10.00',
              valorUnitario: '10.00',
              valorCombo: '50.00',
              preco: '50.00',
              precoFormatado: 'R$ 50,00',
            },
          ],
          premios: [
            {
              ordem: 1,
              descricao: '1º Prêmio — Carro 0km',
              valor: '50000.00',
              valorFormatado: 'R$ 50.000,00',
            },
          ],
        },
      },
    },
  })
  consultarCampanhaAtiva() {
    return this.service.consultarCampanhaAtiva();
  }

  // ─── 3. PREVIEW DE COTAS ──────────────────────────────────────────────────

  @Post('campanhas/:id/cotas/preview')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiOperation({
    summary: '3. Gerar preview de cotas/combos disponíveis (sem reservar)',
    description: `
Gera uma prévia dos combos (conjuntos de números) disponíveis para a campanha.
Exclui automaticamente números já reservados por qualquer canal (POS, loja ou outro
cliente WhatsApp) — mas **ainda não reserva** a seleção mostrada aqui.

**Paginação:** Use \`cursorNumeroBase\` + \`direcao\` para navegar entre os combos disponíveis.

**Atenção:** Os números retornados aqui **não estão reservados**. Podem ser adquiridos por outro
cliente/canal antes do pedido ser finalizado — para travar a seleção, chame
\`POST /whatsapp/campanhas/{id}/reservas\` com os números do combo escolhido antes de criar o pedido.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID da edição ativa (obtido em GET /whatsapp/campanhas/ativa)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: PreviewCotasWhatsappDto })
  @ApiResponse({
    status: 200,
    description: 'Preview de cotas retornado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Combos disponíveis listados com sucesso',
        data: {
          edicaoId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          edicaoNumero: '001',
          tipoCompra: 'COMBO',
          valorUnitarioCartela: '10.00',
          valorCombo: '50.00',
          preco: '50.00',
          quantidadeCartelas: 6,
          cursorNumeroBaseAtual: '0001234',
          combos: [
            {
              ordemSequencia: 1,
              numeroBase: '0001234',
              bilhetes: [
                {
                  ordem: 1,
                  numero: '0001234',
                  sequenciaBolas: [1, 5, 12, 23, 37, 42],
                },
              ],
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Campanha inativa ou tipo de cartela inválido.',
  })
  @ApiResponse({ status: 404, description: 'Campanha não encontrada.' })
  previewCotas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewCotasWhatsappDto,
  ) {
    return this.service.previewCotas(id, dto);
  }

  // ─── 3b. RESERVAR CARTELAS/COMBOS ──────────────────────────────────────────

  @Post('campanhas/:id/reservas')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '3b. 🔒 Reservar cartelas/combos para pré-compra (5 min)',
    description: `
Marca os números escolhidos como **pré-compra** por 5 minutos para o cliente autenticado —
mesmo esquema usado no canal POS (\`POST /pos/edicoes/:edicaoId/reservas\`).

**Por quê reservar?** Evita que outro cliente ou canal (loja, POS) compre a mesma cartela
enquanto o bot ainda está confirmando a escolha com o cliente no WhatsApp.

**Para combo:** envie todos os números de \`bilhetes[].numero\` do combo retornado em
\`POST /whatsapp/campanhas/{id}/cotas/preview\`.

**Depois de reservar:** crie o pedido em \`POST /whatsapp/pedidos\` enviando o mesmo \`numeroBase\`
em \`combosSelecionados\`. A API valida que a seleção ainda pertence a este cliente e estende
a reserva (para 30 minutos) enquanto a cobrança PIX está pendente.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID da edição ativa (obtido em GET /whatsapp/campanhas/ativa)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: ReservarCartelasWhatsappDto })
  @ApiResponse({
    status: 201,
    description: 'Cartelas reservadas para pré-compra.',
    schema: {
      example: {
        statusCode: 201,
        message: 'Cartelas reservadas para pré-compra',
        data: {
          edicaoId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          edicaoNumero: '001',
          reservadas: 6,
          cartelas: ['0001234', '0002345', '0003456'],
          expiresIn: 300,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Campanha inativa ou alguma cartela já foi vendida.',
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 409,
    description: 'Alguma cartela já está reservada em outra pré-compra (outro cliente/canal).',
  })
  @ApiResponse({ status: 404, description: 'Campanha não encontrada.' })
  @ApiResponse({
    status: 503,
    description: 'Redis não configurado para controlar reservas.',
  })
  reservarCartelas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReservarCartelasWhatsappDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.reservarCartelas(id, dto, user.id);
  }

  // ─── 4. CRIAR PEDIDO COM PIX ──────────────────────────────────────────────

  @Post('pedidos')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '4. 🔒 Criar pedido e gerar PIX (operação combinada)',
    description: `
Cria um pedido com status **PENDENTE** e gera automaticamente a cobrança PIX no PagBank,
retornando o código Copia-e-Cola e a URL do QR Code para o bot enviar ao cliente.

**Fluxo interno:**
1. Valida a campanha ativa
2. Cria a venda com status PENDENTE
3. Chama o gateway PagBank (PIX)
4. Retorna os dados do PIX

**Compra unitária e combo:**
- Se \`quantidadeCartelas = 1\`, a compra é unitária.
- Se \`quantidadeCartelas > 1\`, a compra é tratada como combo.
- Se \`quantidadeCartelas\` for omitida, a API assume \`1\`.

**Correlação do pedido no bot/CRM:**
- O campo \`pedidoId\` é o identificador único interno da compra e deve ser armazenado.
- Esse mesmo \`pedidoId\` será enviado depois no POST automático de confirmação de pagamento.
- O bot pode usar \`pedidoId\` como chave principal para atualizar o status local do pedido.

**⚠️ Se o PIX falhar (gateway indisponível):** A API retorna erro HTTP 502 com mensagem
humanizada, e a venda fica marcada como RECUSADO para auditoria interna.

**Reserva prévia (opcional, recomendada para combos):** Se você reservou os números em
\`POST /whatsapp/campanhas/{id}/reservas\` antes de chamar esta rota, envie o mesmo \`numeroBase\`
em \`combosSelecionados\` — a API valida que a reserva ainda pertence a este cliente (HTTP 409 caso
contrário) e estende automaticamente o prazo da reserva enquanto o PIX está pendente.

**Autenticação:** Requer \`Authorization: Bearer {accessToken}\` obtido em \`POST /whatsapp/auth\`.
    `.trim(),
  })
  @ApiBody({ type: CriarPedidoWhatsappDto })
  @ApiResponse({
    status: 201,
    description: 'Pedido criado e PIX gerado com sucesso.',
    schema: {
      example: {
        statusCode: 201,
        message: 'Pedido criado com sucesso. Aguardando pagamento PIX.',
        data: {
          pedidoId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          status: 'PENDENTE',
          total: '10.00',
          totalFormatado: 'R$ 10,00',
          quantidade: 6,
          quantidadeCombos: 1,
          quantidadeCartelasPorCombo: 6,
          quantidadeCartelas: 6,
          tipoCompra: 'COMBO',
          valorUnitarioCartela: '10.00',
          valorCombo: '50.00',
          campanha: { id: 'a1b2c3d4...', numero: '001' },
          pagamento: {
            tipo: 'PIX',
            pixCopiaECola: '00020126580014br.gov.bcb.pix0136...',
            qrCodeUrl: 'https://assets.pagseguro.com.br/qrcode/...',
            expiracaoMinutos: 60,
            instrucoes: 'Copie o código PIX e pague no seu banco...',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Campanha inativa, tipo de cartela inválido ou combinação incorreta de campos.',
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado.' })
  @ApiResponse({ status: 404, description: 'Campanha não encontrada.' })
  @ApiResponse({
    status: 409,
    description:
      'Algum dos números em combosSelecionados não está reservado para este cliente (reserva expirou ou pertence a outro cliente/canal).',
  })
  @ApiResponse({
    status: 502,
    description:
      'Não foi possível gerar o PIX. O bot deve informar o cliente para tentar novamente.',
    schema: {
      example: {
        statusCode: 502,
        message:
          'Não conseguimos gerar o PIX agora. Tente novamente em alguns instantes.',
        data: null,
      },
    },
  })
  criarPedido(
    @Body() dto: CriarPedidoWhatsappDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.criarPedidoComPix(dto, user.id);
  }

  // ─── 5. STATUS DO PAGAMENTO ───────────────────────────────────────────────

  @Get('pedidos/:id/pagamento')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '5. 🔒 Consultar status do pagamento PIX',
    description: `
Consulta o status do pagamento de um pedido específico.

**Status possíveis:**
- \`PENDENTE\` → Aguardando pagamento
- \`APROVADO\` → Pagamento confirmado — buscar cartelas em \`GET /pedidos/{id}/cartelas\`
- \`CANCELADO\` → Pedido cancelado
- \`RECUSADO\` → Pagamento recusado

**Polling:** O bot pode chamar esta rota periodicamente (ex: a cada 30s) para verificar
se o pagamento foi confirmado, até receber \`APROVADO\` ou timeout.

**⚠️ Nunca expira automaticamente:** Monitore o \`statusGateway\` retornado para verificar
se o PIX expirou no gateway antes de criar um novo pedido.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID do pedido (obtido em POST /whatsapp/pedidos)',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do pagamento consultado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Status do pagamento consultado',
        data: {
          pedidoId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          status: 'PENDENTE',
          statusLabel: 'Aguardando pagamento',
          statusGateway: 'PENDENTE',
          total: '10.00',
          criadoEm: '2026-05-08T11:00:00.000Z',
          pago: false,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 404,
    description: 'Pedido não encontrado ou não pertence ao cliente.',
  })
  consultarStatusPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarStatusPagamento(id, user.id);
  }

  // ─── 6. CARTELAS COMPRADAS ────────────────────────────────────────────────

  @Get('pedidos/:id/cartelas')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '6. 🔒 Retornar cartelas/números comprados',
    description: `
Retorna os números das cartelas de um pedido **aprovado**, equivalente ao "Meus Números" da loja.

**Pré-requisito:** O pedido deve ter status \`APROVADO\`. Se ainda estiver \`PENDENTE\`,
retorna a lista vazia com uma mensagem de aviso.

**Estrutura retornada:**
- \`cartelas\`: array de cartelas, cada uma com seus bilhetes
- Cada bilhete tem \`numero\` (7 dígitos) e \`sequenciaBolas\` (ordem de sorteio)
- \`quantidadeCartelasPorCombo\`: quantidade de cartelas por combo (inteiro de 1 a 12)

**Uso no bot:** Use este retorno para gerar uma mensagem como:
> 🎯 Sua(s) cartela(s):
> Cartela 1: 0001234 | 0002345 | 0003456 | ...
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID do pedido aprovado',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiResponse({
    status: 200,
    description: 'Cartelas retornadas com sucesso.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Cartelas encontradas com sucesso',
        data: {
          pedidoId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          status: 'APROVADO',
          campanha: {
            id: 'a1b2c3d4...',
            numero: '001',
            dataSorteio: '2026-06-01T15:00:00.000Z',
            qtdNumerosCartela: 15,
          },
          totalCartelas: 1,
          totalBilhetes: 6,
          quantidadeCartelasPorCombo: 6,
          cartelas: [
            {
              ordemCartela: 1,
              bilhetes: [
                { numero: '0001234', sequenciaBolas: [1, 5, 12, 23, 37, 42] },
                { numero: '0002345', sequenciaBolas: [3, 8, 15, 27, 39, 45] },
              ],
            },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 404,
    description: 'Pedido não encontrado ou não pertence ao cliente.',
  })
  consultarCartelas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarCartelas(id, user.id);
  }

  // ─── 7. LISTAR PEDIDOS ────────────────────────────────────────────────────

  @Get('pedidos')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '7. 🔒 Consultar pedidos do cliente (por telefone ou ID)',
    description: `
Lista os pedidos do cliente autenticado. Filtros opcionais permitem buscar por telefone ou ID específico.

**Segurança:** Apenas pedidos do cliente autenticado no JWT são retornados.
Não é possível consultar pedidos de outros clientes.

**Filtro por telefone:** Usado para confirmar a identidade antes de mostrar os pedidos.
Se o telefone informado não corresponder ao cadastro do cliente, retorna erro 400.

**Paginação:** Use \`page\` e \`limit\` para navegar pelo histórico.
    `.trim(),
  })
  @ApiQuery({
    name: 'pedidoId',
    required: false,
    description: 'Filtrar por ID de pedido específico.',
  })
  @ApiQuery({
    name: 'telefone',
    required: false,
    description: 'Confirmar identidade por telefone.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Página (default: 1).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Itens por página (default: 10, máx: 50).',
  })
  @ApiResponse({
    status: 200,
    description: 'Pedidos retornados.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Pedidos encontrados',
        data: {
          total: 2,
          page: 1,
          totalPages: 1,
          pedidos: [
            {
              pedidoId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
              status: 'APROVADO',
              statusLabel: 'Pagamento confirmado ✅',
              campanha: {
                id: '...',
                numero: '001',
                dataSorteio: '2026-06-01T15:00:00.000Z',
              },
              quantidade: 1,
              quantidadeCartelas: 6,
              totalBilhetes: 6,
              total: '10.00',
              totalFormatado: 'R$ 10,00',
              criadoEm: '2026-05-08T11:00:00.000Z',
              temCartelas: true,
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Telefone não corresponde ao cadastro do cliente.',
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  consultarPedidos(
    @Query() filtros: ConsultarPedidosWhatsappDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarPedidos(user.id, filtros);
  }

  // ─── 7b. DETALHE DE PEDIDO ────────────────────────────────────────────────

  @Get('pedidos/:id')
  @ApiTags(WHATSAPP_PREMIOS_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '7b. 🔒 Detalhes de um pedido específico',
    description: `
Retorna todos os detalhes de um pedido, incluindo os bilhetes se o pedido estiver aprovado.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID do pedido',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @ApiResponse({ status: 200, description: 'Pedido detalhado retornado.' })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado.' })
  detalharPedido(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.detalharPedido(id, user.id);
  }

  // ─── 9. CAPITAL SENA — CAMPANHA ATIVA ─────────────────────────────────────

  @Get('sena/campanhas/ativa')
  @ApiTags(WHATSAPP_SENA_TAG)
  @ApiOperation({
    summary: '9. Consultar campanha/edição Sena ativa',
    description: `
Retorna os dados completos da campanha Capital Sena ativa no momento.

**Uso:** O bot deve chamar esta rota para obter o \`id\` da edição (necessário para criar pedidos)
e os combos/preços disponíveis.

Se não houver campanha ativa, retorna \`data: null\`.
    `.trim(),
  })
  @ApiResponse({
    status: 200,
    description: 'Campanha Sena ativa retornada (ou null se não houver).',
    schema: {
      example: {
        statusCode: 200,
        message: 'Campanha Sena ativa encontrada',
        data: {
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          numero: '2026-15',
          titulo: 'Capital Sena 2026-15',
          descricao: 'Acerte os 6 números da Mega-Sena e ganhe!',
          imagemUrl: 'https://cdn.exemplo.com/sena-2026-15.jpg',
          status: 'ATIVA',
          dataSorteioMegaSena: '2026-06-05T20:00:00.000Z',
          dataEncerramento: '2026-06-05T18:00:00.000Z',
          valorCartela: '5.00',
          combos: [
            {
              id: 'fd2f8a0e-8ce6-4aa2-9c94-668c7530a111',
              nome: 'Combo 3 cartelas',
              quantidade: 3,
              preco: '12.00',
              precoFormatado: 'R$ 12,00',
            },
          ],
          premios: [
            {
              faixa: 'SENA',
              descricao: 'Acertar os 6 números',
              valor: '100000.00',
              imagemUrl: null,
              valorFormatado: 'R$ 100.000,00',
            },
          ],
        },
      },
    },
  })
  consultarCampanhaSenaAtiva() {
    return this.service.consultarCampanhaSenaAtiva();
  }

  // ─── 10. CAPITAL SENA — CRIAR PEDIDO COM PIX ──────────────────────────────

  @Post('sena/pedidos')
  @ApiTags(WHATSAPP_SENA_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '10. 🔒 Criar pedido Sena e gerar PIX (operação combinada)',
    description: `
Cria um pedido Capital Sena com status **PENDENTE** e gera automaticamente a cobrança PIX,
retornando o código Copia-e-Cola e a URL do QR Code para o bot enviar ao cliente.

**Seleção das cartelas:**
- \`cartelas\`: lista explícita (cada item \`MANUAL\` com 6 números de 1 a 60, ou \`SURPRESINHA\`).
- \`quantidade\`: compra rápida unitária — gera N cartelas surpresinha automaticamente.
- \`comboSenaId\`: compra de combo — se \`cartelas\` for omitido, gera automaticamente a
  quantidade de cartelas do combo (surpresinha).

**Autenticação:** Requer \`Authorization: Bearer {accessToken}\` obtido em \`POST /whatsapp/auth\`
— os dados do cliente (CPF, nome, telefone, e-mail, data de nascimento) são resolvidos pelo token,
não envie esses campos no corpo.

**⚠️ Se o PIX falhar (gateway indisponível):** A API retorna erro HTTP 502 com mensagem
humanizada, e a venda fica marcada como RECUSADO para auditoria interna.
    `.trim(),
  })
  @ApiBody({
    type: CriarPedidoSenaWhatsappDto,
    examples: {
      compraRapida: {
        summary: 'Compra rápida unitária (surpresinha)',
        value: { edicaoSenaId: 'c3d4e5f6-a7b8-9012-cdef-123456789012', quantidade: 2 },
      },
      cartelaManual: {
        summary: 'Cartela manual com números escolhidos',
        value: {
          edicaoSenaId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          cartelas: [{ modoSelecao: 'MANUAL', numeros: [3, 12, 24, 37, 45, 58] }],
        },
      },
      combo: {
        summary: 'Compra de combo (surpresinha automática)',
        value: {
          edicaoSenaId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          comboSenaId: 'fd2f8a0e-8ce6-4aa2-9c94-668c7530a111',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Pedido Sena criado e PIX gerado com sucesso.',
    schema: {
      example: {
        statusCode: 201,
        message: 'Pedido Sena criado com sucesso. Aguardando pagamento PIX.',
        data: {
          pedidoId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
          status: 'PENDENTE',
          total: '12.00',
          totalFormatado: 'R$ 12,00',
          quantidadeCartelas: 3,
          campanha: { id: 'c3d4e5f6...', numero: '2026-15' },
          cartelas: [{ numerosEscolhidos: [3, 12, 24, 37, 45, 58], modoSelecao: 'MANUAL' }],
          pagamento: {
            tipo: 'PIX',
            pixCopiaECola: '00020126580014br.gov.bcb.pix0136...',
            qrCodeUrl: 'https://assets.pagseguro.com.br/qrcode/...',
            expiracaoMinutos: 60,
            instrucoes: 'Copie o código PIX e pague no seu banco...',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Edição inativa, cartelas/combo inválidos ou cliente sem data de nascimento.',
  })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado.' })
  @ApiResponse({ status: 404, description: 'Campanha ou combo não encontrado.' })
  @ApiResponse({
    status: 502,
    description: 'Não foi possível gerar o PIX. O bot deve informar o cliente para tentar novamente.',
  })
  criarPedidoSena(
    @Body() dto: CriarPedidoSenaWhatsappDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.criarPedidoSenaComPix(dto, user.id);
  }

  // ─── 11. CAPITAL SENA — STATUS DO PAGAMENTO ───────────────────────────────

  @Get('sena/pedidos/:id/pagamento')
  @ApiTags(WHATSAPP_SENA_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '11. 🔒 Consultar status do pagamento PIX — Sena',
    description: `
Consulta o status do pagamento de um pedido Sena específico.

**Status possíveis:**
- \`PENDENTE\` → Aguardando pagamento
- \`APROVADO\` → Pagamento confirmado — buscar cartelas em \`GET /sena/pedidos/{id}/cartelas\`
- \`CANCELADO\` → Pedido cancelado
- \`RECUSADO\` → Pagamento recusado

**Polling:** O bot pode chamar esta rota periodicamente (ex: a cada 30s) até receber \`APROVADO\`.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID do pedido Sena (obtido em POST /whatsapp/sena/pedidos)',
    example: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  })
  @ApiResponse({
    status: 200,
    description: 'Status do pagamento Sena consultado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Status do pagamento Sena consultado',
        data: {
          pedidoId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
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
    status: 404,
    description: 'Pedido não encontrado ou não pertence ao cliente.',
  })
  consultarStatusPagamentoSena(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarStatusPagamentoSena(id, user.id);
  }

  // ─── 12. CAPITAL SENA — CARTELAS COMPRADAS ────────────────────────────────

  @Get('sena/pedidos/:id/cartelas')
  @ApiTags(WHATSAPP_SENA_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '12. 🔒 Retornar cartelas/números comprados — Sena',
    description: `
Retorna os números das cartelas Sena de um pedido **aprovado**.

**Pré-requisito:** O pedido deve ter status \`APROVADO\`. Se ainda estiver \`PENDENTE\`,
retorna a lista vazia com uma mensagem de aviso.

**Estrutura retornada:** cada cartela tem \`numerosEscolhidos\` (6 números, 1 a 60),
\`setimoNumero\` (gerado pelo sistema após a confirmação) e \`modoSelecao\` (MANUAL ou SURPRESINHA).
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID do pedido Sena aprovado',
    example: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  })
  @ApiResponse({
    status: 200,
    description: 'Cartelas retornadas com sucesso.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Cartelas encontradas com sucesso',
        data: {
          pedidoId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
          status: 'APROVADO',
          campanha: {
            id: 'c3d4e5f6...',
            numero: '2026-15',
            dataSorteioMegaSena: '2026-06-05T20:00:00.000Z',
          },
          totalCartelas: 1,
          cartelas: [
            { numerosEscolhidos: [3, 12, 24, 37, 45, 58], setimoNumero: 41, modoSelecao: 'MANUAL' },
          ],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({
    status: 404,
    description: 'Pedido não encontrado ou não pertence ao cliente.',
  })
  consultarCartelasSena(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarCartelasSena(id, user.id);
  }

  // ─── 13. CAPITAL SENA — LISTAR PEDIDOS ────────────────────────────────────

  @Get('sena/pedidos')
  @ApiTags(WHATSAPP_SENA_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '13. 🔒 Consultar pedidos Sena do cliente (por telefone ou ID)',
    description: `
Lista os pedidos Sena do cliente autenticado. Filtros opcionais permitem buscar por
telefone ou ID específico.

**Segurança:** Apenas pedidos do cliente autenticado no JWT são retornados.

**Paginação:** Use \`page\` e \`limit\` para navegar pelo histórico.
    `.trim(),
  })
  @ApiQuery({ name: 'pedidoId', required: false, description: 'Filtrar por ID de pedido específico.' })
  @ApiQuery({ name: 'telefone', required: false, description: 'Confirmar identidade por telefone.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página (default: 1).' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página (default: 10, máx: 50).' })
  @ApiResponse({
    status: 200,
    description: 'Pedidos Sena retornados.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Pedidos encontrados',
        data: {
          total: 1,
          page: 1,
          totalPages: 1,
          pedidos: [
            {
              pedidoId: 'd4e5f6a7-b8c9-0123-defa-234567890123',
              status: 'APROVADO',
              statusLabel: 'Pagamento confirmado ✅',
              campanha: {
                id: 'c3d4e5f6...',
                numero: '2026-15',
                dataSorteioMegaSena: '2026-06-05T20:00:00.000Z',
              },
              quantidadeCartelas: 3,
              total: '12.00',
              totalFormatado: 'R$ 12,00',
              criadoEm: '2026-05-28T14:30:00.000Z',
              temCartelas: true,
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Telefone não corresponde ao cadastro do cliente.',
  })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  consultarPedidosSena(
    @Query() filtros: ConsultarPedidosWhatsappDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarPedidosSena(user.id, filtros);
  }

  // ─── 13b. CAPITAL SENA — DETALHE DE PEDIDO ────────────────────────────────

  @Get('sena/pedidos/:id')
  @ApiTags(WHATSAPP_SENA_TAG)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '13b. 🔒 Detalhes de um pedido Sena específico',
    description: `
Retorna todos os detalhes de um pedido Sena, incluindo as cartelas se o pedido estiver aprovado.
    `.trim(),
  })
  @ApiParam({
    name: 'id',
    description: 'ID do pedido Sena',
    example: 'd4e5f6a7-b8c9-0123-defa-234567890123',
  })
  @ApiResponse({ status: 200, description: 'Pedido Sena detalhado retornado.' })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  @ApiResponse({ status: 404, description: 'Pedido não encontrado.' })
  detalharPedidoSena(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.detalharPedidoSena(id, user.id);
  }

  // ─── 14. WEBHOOK PAGAMENTO ─────────────────────────────────────────────────

  @Post('webhook/pagamento')
  @ApiTags(WHATSAPP_GERAL_TAG)
  @ApiOperation({
    summary: '14. Webhook PagBank — Confirmação de pagamento (sem auth)',
    description: `
Endpoint para receber notificações de pagamento confirmado do PagBank.

**Configure esta URL no painel PagBank** (Configurações → Notificações → Webhook):
\`https://seu-dominio.com/api/whatsapp/webhook/pagamento\`

**Formato do payload PagBank:**
\`\`\`json
{
  "event": "CHARGE.PAID",
  "charges": [
    {
      "id": "CHAR_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "status": "PAID",
      "paid_at": "2026-05-08T14:30:00.000-03:00",
      "amount": { "value": 1000, "currency": "BRL" }
    }
  ]
}
\`\`\`

**Comportamento:**
- Ao receber \`CHARGE.PAID\`, o pedido é confirmado, os bilhetes são gerados e as comissões são calculadas.
- Após confirmar internamente o pedido, a API faz um POST para a URL configurada em \`WHATSAPP_CONFIRMACAO_PAGAMENTO_URL\`.
- Esse POST externo envia os dados necessários para o bot/CRM atualizar o pedido localmente.
- Eventos com status diferente de \`PAID\` são ignorados.
- Idempotente: pedidos já confirmados são ignorados sem erro.

**Payload enviado ao bot/CRM via \`WHATSAPP_CONFIRMACAO_PAGAMENTO_URL\`:**
\`\`\`json
{
  "pedidoId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "transacaoId": "ORDE_59D7AA29-A5BF-4288-9588-1A132EAFB472",
  "nome": "João da Silva",
  "telefone": "61999999999",
  "cpf": "12345678900",
  "valor": "10.00",
  "dataHora": "2026-05-18T15:42:10.000Z",
  "status": "APROVADO"
}
\`\`\`
    `.trim(),
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processado.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Webhook processado',
        data: [{ chargeId: 'CHAR_XXXX', status: 'CONFIRMADA' }],
      },
    },
  })
  webhookPagamento(@Body() body: Record<string, unknown>) {
    return this.service.processarWebhookPagamento(body);
  }
}
