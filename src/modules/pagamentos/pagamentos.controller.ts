import {
  Body,
  Controller,
  Get,
  Headers,
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
import { PagamentosService } from './pagamentos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Pagamentos — Webhook + Consulta
 *
 * Rotas:
 *   - POST /pagamentos/webhook/pix           → Callback PIX PagBank (sem auth)
 *   - POST /pagamentos/webhook/cartao        → Callback Cartão PagBank (sem auth)
 *   - POST /pagamentos/webhook/mercadopago   → Callback PIX Mercado Pago (sem auth)
 *   - GET  /admin/pagamentos                  → Listar pagamentos (ADMIN)
 *   - GET  /admin/pagamentos/:id              → Detalhes de pagamento (ADMIN)
 *   - GET  /admin/pagamentos/vendas/:id/status → Consultar status no gateway (ADMIN)
 */
@ApiTags('Pagamentos')
@Controller()
export class PagamentosController {
  constructor(private readonly pagamentosService: PagamentosService) {}

  // ─── WEBHOOKS (sem autenticação) ──────────────────────

  @Post('pagamentos/webhook/pix')
  @ApiOperation({
    summary: 'Webhook PIX do PagBank — Notificação de pagamento (sem auth)',
  })
  webhookPix(@Body() body: Record<string, unknown>) {
    return this.pagamentosService.processarWebhookPix(body);
  }

  @Post('pagamentos/webhook/cartao')
  @ApiOperation({
    summary:
      'Webhook Cartão de Crédito do PagBank — Notificação de pagamento (sem auth)',
  })
  webhookCartao(@Body() body: Record<string, unknown>) {
    return this.pagamentosService.processarWebhookCartao(body);
  }

  @Post('pagamentos/webhook/mercadopago')
  @ApiOperation({
    summary:
      'Webhook PIX do Mercado Pago (Orders API) — Notificação de pagamento (sem auth)',
  })
  webhookMercadoPago(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
  ) {
    return this.pagamentosService.processarWebhookMercadoPago(
      headers,
      query,
      body,
    );
  }

  // ─── ADMIN ROUTES ─────────────────────────────────────

  @Get('admin/pagamentos')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar pagamentos (ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query() pagination: PaginationQueryDto) {
    return this.pagamentosService.findAll(pagination.page, pagination.limit);
  }

  @Get('admin/pagamentos/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Detalhes de um pagamento (ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagamentosService.findOne(id);
  }

  @Get('admin/pagamentos/vendas/:vendaId/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Consultar status da cobrança no gateway (ADMIN)' })
  consultarStatus(@Param('vendaId', ParseUUIDPipe) vendaId: string) {
    return this.pagamentosService.consultarStatusCobranca(vendaId);
  }
}
