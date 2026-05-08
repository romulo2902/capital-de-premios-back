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
import { ConsultarPedidosWhatsappDto } from './dto/consultar-pedidos-whatsapp.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/**
 * ## WhatsApp API — Guia de Integração
 *
 * Collection dedicada para bots e CRMs que operam via WhatsApp
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
 *    → Retorna: id da edição e o valor unitário da cartela
 *
 * 3. Criar o pedido informando quantidade de cartelas → gera PIX
 *    → POST /api/whatsapp/pedidos  [Bearer]
 *    → Retorna: pedidoId + pixCopiaECola + qrCodeUrl
 *
 * 4. Enviar o código PIX ao cliente via WhatsApp e aguardar pagamento
 *
 * 5. Consultar status do pagamento (polling)
 *    → GET /api/whatsapp/pedidos/{id}/pagamento  [Bearer]
 *    → Retorna: status (PENDENTE / APROVADO / CANCELADO)
 *
 * 6. Após APROVADO — retornar as cartelas com os números
 *    → GET /api/whatsapp/pedidos/{id}/cartelas  [Bearer]
 *    → Retorna: lista de cartelas com números e sequência de bolas
 *
 * 7. Consultar pedidos anteriores do cliente
 *    → GET /api/whatsapp/pedidos  [Bearer]
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
 * Esta rota **não** exige autenticação JWT.
 */
@ApiTags('WhatsApp API')
@Controller('whatsapp')
export class WhatsappApiController {
  constructor(private readonly service: WhatsappApiService) {}

  // ─── 1. AUTENTICAÇÃO / CADASTRO ───────────────────────────────────────────

  @Post('auth')
  @ApiOperation({
    summary: '1. Registrar ou autenticar cliente por CPF',
    description: `
Registra um novo cliente ou autentica um cliente existente usando o CPF como identificador único.

**Comportamento:**
- **CPF novo:** cria o cadastro e retorna o JWT.
- **CPF existente:** atualiza nome e telefone e retorna o JWT.

**Por que telefone é obrigatório?**
O telefone é o canal de origem (WhatsApp) e é usado para consultar pedidos futuros.

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
  @ApiResponse({ status: 400, description: 'Dados inválidos (CPF, telefone, etc.).' })
  auth(@Body() dto: AuthWhatsappDto) {
    return this.service.autenticarOuCriar(dto);
  }

  // ─── 2. CAMPANHA ATIVA ────────────────────────────────────────────────────

  @Get('campanhas/ativa')
  @ApiOperation({
    summary: '2. Consultar campanha/edição ativa',
    description: `
Retorna os dados completos da campanha de sorteio ativa no momento.

**Uso:** O bot deve chamar esta rota para obter o \`id\` da edição (necessário para criar pedidos)
e o valor unitário da cartela (\`valorCartela\`).

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
          valorCartelaFormatado: 'R$ 10,00',
          qtdNumerosCartela: 15,
          premios: [
            { ordem: 1, descricao: '1º Prêmio — Carro 0km', valor: '50000.00', valorFormatado: 'R$ 50.000,00' },
          ],
        },
      },
    },
  })
  consultarCampanhaAtiva() {
    return this.service.consultarCampanhaAtiva();
  }

  // ─── 3. CRIAR PEDIDO COM PIX ──────────────────────────────────────────────

  @Post('pedidos')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '3. 🔒 Criar pedido e gerar PIX',
    description: `
Cria um pedido e gera automaticamente a cobrança PIX no PagBank em uma única chamada.

**Fluxo:** Informe a quantidade de cartelas — os números são gerados e validados automaticamente após a aprovação do PIX.
O bot recebe o \`pixCopiaECola\` e a URL do QR Code para enviar ao cliente via WhatsApp.

**Campos:**
- \`edicaoId\` — ID da campanha ativa (obtido em \`GET /whatsapp/campanhas/ativa\`)
- \`quantidade\` — quantas cartelas comprar (mínimo 1)

**⚠️ Se o PIX falhar (gateway indisponível):** O pedido é criado com status PENDENTE mas sem
dados de PIX. O bot deve informar ao cliente e sugerir tentar novamente.

**Autenticação:** Requer \`Authorization: Bearer {accessToken}\` obtido em \`POST /whatsapp/auth\`.
    `.trim(),
  })
  @ApiBody({ type: CriarPedidoWhatsappDto })
  @ApiResponse({
    status: 201,
    description: 'Pedido criado e PIX gerado com sucesso.',
    schema: {
      example: {
        statusCode: 200,
        message: 'Pedido criado com sucesso. Aguardando pagamento PIX.',
        data: {
          pedidoId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          status: 'PENDENTE',
          total: '20.00',
          totalFormatado: 'R$ 20,00',
          quantidade: 2,
          tipoCartela: 'UMA_CHANCE',
          campanha: { id: 'a1b2c3d4...', numero: '001' },
          pagamento: {
            tipo: 'PIX',
            pixCopiaECola: '00020126580014br.gov.bcb.pix0136...',
            qrCodeUrl: 'https://assets.pagseguro.com.br/qrcode/...',
            expiracaoMinutos: 60,
            instrucoes: 'Copie o código PIX e pague no seu banco. O pedido é confirmado automaticamente após o pagamento.',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Campanha inativa ou tipo de cartela inválido.' })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado.' })
  @ApiResponse({ status: 404, description: 'Campanha não encontrada.' })
  criarPedido(
    @Body() dto: CriarPedidoWhatsappDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.criarPedidoComPix(dto, user.id);
  }

  // ─── 4. STATUS DO PAGAMENTO ───────────────────────────────────────────────

  @Get('pedidos/:id/pagamento')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '4. 🔒 Consultar status do pagamento PIX',
    description: `
Consulta o status do pagamento de um pedido específico.

**Status possíveis:**
- \`PENDENTE\` → Aguardando pagamento
- \`APROVADO\` → Pagamento confirmado — buscar cartelas em \`GET /pedidos/{id}/cartelas\`
- \`CANCELADO\` → Pedido cancelado
- \`RECUSADO\` → Pagamento recusado

**Polling:** O bot pode chamar esta rota periodicamente (ex: a cada 30s) para verificar
se o pagamento foi confirmado, até receber \`APROVADO\` ou timeout.

Monitore o \`statusGateway\` para verificar se o PIX expirou no gateway antes de criar um novo pedido.
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
  @ApiResponse({ status: 404, description: 'Pedido não encontrado ou não pertence ao cliente.' })
  consultarStatusPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarStatusPagamento(id, user.id);
  }

  // ─── 5. CARTELAS COMPRADAS ────────────────────────────────────────────────

  @Get('pedidos/:id/cartelas')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '5. 🔒 Retornar cartelas/números comprados',
    description: `
Retorna os números das cartelas de um pedido **aprovado**, equivalente ao "Meus Números" da loja.

**Pré-requisito:** O pedido deve ter status \`APROVADO\`. Se ainda estiver \`PENDENTE\`,
retorna a lista vazia com uma mensagem de aviso.

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
          tipoCartela: 'SEIS_CHANCES',
          totalCartelas: 1,
          totalBilhetes: 6,
          quantidadeChancesPorCartela: 6,
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
  @ApiResponse({ status: 404, description: 'Pedido não encontrado ou não pertence ao cliente.' })
  consultarCartelas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarCartelas(id, user.id);
  }

  // ─── 6. LISTAR PEDIDOS ────────────────────────────────────────────────────

  @Get('pedidos')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '6. 🔒 Consultar pedidos do cliente',
    description: `
Lista os pedidos do cliente autenticado. Filtros opcionais por telefone ou ID de pedido.

**Segurança:** Apenas pedidos do cliente autenticado no JWT são retornados.

**Filtro por telefone:** Valida que o telefone informado corresponde ao cadastro do cliente.
Se não corresponder, retorna erro 400.
    `.trim(),
  })
  @ApiQuery({ name: 'pedidoId', required: false, description: 'Filtrar por ID de pedido específico.' })
  @ApiQuery({ name: 'telefone', required: false, description: 'Confirmar identidade por telefone.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Página (default: 1).' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Itens por página (default: 10, máx: 50).' })
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
              campanha: { id: '...', numero: '001', dataSorteio: '2026-06-01T15:00:00.000Z' },
              tipoCartela: 'SEIS_CHANCES',
              quantidade: 1,
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
  @ApiResponse({ status: 400, description: 'Telefone não corresponde ao cadastro do cliente.' })
  @ApiResponse({ status: 401, description: 'Token inválido.' })
  consultarPedidos(
    @Query() filtros: ConsultarPedidosWhatsappDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.consultarPedidos(user.id, filtros);
  }

  // ─── 6b. DETALHE DE PEDIDO ────────────────────────────────────────────────

  @Get('pedidos/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({
    summary: '6b. 🔒 Detalhes de um pedido específico',
    description: 'Retorna todos os detalhes de um pedido, incluindo os bilhetes se o pedido estiver aprovado.',
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

  // ─── 7. WEBHOOK PAGAMENTO ─────────────────────────────────────────────────

  @Post('webhook/pagamento')
  @ApiOperation({
    summary: '7. Webhook PagBank — Confirmação de pagamento (sem auth)',
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
- Ao receber \`CHARGE.PAID\`, o pedido é confirmado, os bilhetes são gerados e as comissões calculadas.
- Eventos com status diferente de \`PAID\` são ignorados.
- Idempotente: pedidos já confirmados são ignorados sem erro.
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
