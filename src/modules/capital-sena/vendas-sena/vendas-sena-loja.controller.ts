import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';
import { VendasSenaService } from './vendas-sena.service';
import { CreateVendaSenaDto } from './dto/create-venda-sena.dto';

/**
 * Rotas públicas da loja Capital Sena (cliente autenticado ou anônimo para compra).
 */
@ApiTags('Sena / Loja')
@Controller('capital-sena')
export class VendasSenaLojaController {
  constructor(private readonly vendasSenaService: VendasSenaService) {}

  @Post('comprar')
  @ApiOperation({
    summary:
      'Comprar cartela(s) Sena — aceita cartelas MANUAL/SURPRESINHA explícitas ou compra rápida via `quantidade` (unitário) ou `comboSenaId` (combo). Gera PIX/Cartão e aguarda confirmação.',
  })
  comprar(@Body() dto: CreateVendaSenaDto) {
    return this.vendasSenaService.create(dto);
  }

  @Get('vendas/:id/status')
  @ApiOperation({ summary: 'Consultar status de pagamento da venda Sena' })
  consultarStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendasSenaService.findOne(id);
  }

  @Get('minhas-compras')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENTE')
  @ApiOperation({ summary: 'Listar compras do cliente logado (CLIENTE)' })
  minhasCompras(@CurrentUser() user: RequestUser) {
    // user.cpf é populado pelo JWT strategy para CLIENTE
    if (!user.cpf) return { message: 'CPF não disponível', data: [] };
    return this.vendasSenaService.findByCliente(user.cpf);
  }
}
