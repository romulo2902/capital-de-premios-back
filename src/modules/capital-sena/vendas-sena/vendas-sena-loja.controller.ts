import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
      'Comprar cartela(s) Sena — recebe `numeros` do frontend com 6 números + bola extra. Gera PIX/Cartão e aguarda confirmação.',
    description:
      'Rota pública. O vínculo comercial da venda vem exclusivamente de ' +
      '`seller_id` (o `?seller_id=` do link/QR Code do vendedor ou distribuidor). ' +
      '`vendedorId` e `distribuidorId` enviados no corpo são descartados: sem ' +
      'autenticação, aceitá-los deixaria qualquer um escolher o destino da comissão.',
  })
  comprar(@Body() dto: CreateVendaSenaDto) {
    // Rota pública e sem autenticação: o vínculo comercial só pode vir de
    // `seller_id`, que o service resolve contra o banco.
    //
    // Estes dois `delete` sustentam a garantia — não são vestigiais. O service
    // só deixa o `seller_id` definir o vínculo quando nenhum dos dois campos
    // veio no corpo (`if (!dto.vendedorId && !dto.distribuidorId)`). Sem o
    // descarte, um corpo com `vendedorId` torna essa condição falsa, o bloco do
    // `seller_id` é pulado inteiro e o valor do corpo chega intacto à geração
    // de comissão — qualquer um, sem login, escolhendo o destino dela.
    delete dto.vendedorId;
    delete dto.distribuidorId;
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
