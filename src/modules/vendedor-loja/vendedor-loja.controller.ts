import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { VendedorLojaService } from './vendedor-loja.service';
import { SolicitarSaqueVendedorDto } from './dto/vendedor-loja.dto';
import { ForbiddenException } from '@nestjs/common';

@ApiTags('Loja / Vendedor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VENDEDOR')
@Controller('vendedor')
export class VendedorLojaController {
  constructor(private readonly service: VendedorLojaService) {}

  private getVendedorId(user: RequestUser): string {
    if (!user.vendedorId) throw new ForbiddenException('Perfil de vendedor não encontrado');
    return user.vendedorId;
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────
  @Get('perfil')
  @ApiOperation({ summary: 'Ver próprio perfil (VENDEDOR)' })
  getPerfil(@CurrentUser() user: RequestUser) {
    return this.service.getPerfil(this.getVendedorId(user));
  }

  // ─── Vendas (RF-V02) ──────────────────────────────────────────────────────
  @Get('vendas')
  @ApiOperation({ summary: 'Listar apenas as próprias vendas (VENDEDOR — RF-V02)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO'] })
  getVendas(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.service.getVendas(this.getVendedorId(user), { page: +page, limit: +limit, status });
  }

  // ─── Comissões (RF-V03) ───────────────────────────────────────────────────
  @Get('comissoes')
  @ApiOperation({ summary: 'Ver comissões próprias com total acumulado (VENDEDOR — RF-V03)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDENTE', 'PAGO'] })
  getComissoes(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.service.getComissoes(this.getVendedorId(user), { page: +page, limit: +limit, status });
  }

  // ─── Saques (RF-V04, RF-V05) ──────────────────────────────────────────────
  @Get('saques')
  @ApiOperation({ summary: 'Histórico de saques (VENDEDOR — RF-V05)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getSaques(
    @CurrentUser() user: RequestUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.service.getSaques(this.getVendedorId(user), {
      page: +page,
      limit: +limit,
    });
  }

  @Post('saques')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Solicitar saque de comissão disponível (VENDEDOR — RF-V04)' })
  criarSaque(
    @CurrentUser() user: RequestUser,
    @Body() dto: SolicitarSaqueVendedorDto,
  ) {
    return this.service.criarSaque(this.getVendedorId(user), dto.valor);
  }
}
