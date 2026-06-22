import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QrcodeService } from './qrcode.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Admin / QR Code')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/qrcode')
export class QrcodeController {
  constructor(private readonly qrcodeService: QrcodeService) {}

  @Get('me')
  @Roles('DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({
    summary:
      'Obter link e QR Code do usuário autenticado (DISTRIBUIDOR/VENDEDOR)',
  })
  meuQrcode(@CurrentUser() user: RequestUser) {
    return this.qrcodeService.obterMeuQrcode(user);
  }

  @Get('sena/me')
  @Roles('DISTRIBUIDOR', 'VENDEDOR')
  @ApiOperation({
    summary:
      'Obter link e QR Code Sena do usuário autenticado (DISTRIBUIDOR/VENDEDOR)',
  })
  meuQrcodeSena(@CurrentUser() user: RequestUser) {
    return this.qrcodeService.obterMeuQrcodeSena(user);
  }

  @Get('sena/vendedor/:id')
  @Header('Content-Type', 'image/png')
  @ApiOperation({ summary: 'Obter QR Code Sena do vendedor (PNG) (ADMIN)' })
  async vendedorSena(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.qrcodeService.gerarQrcodeSenaVendedor(id);
    return new StreamableFile(buffer, { type: 'image/png' });
  }

  @Get('sena/vendedor/:id/link')
  @ApiOperation({
    summary: 'Obter link persistido do QR Code Sena do vendedor (ADMIN)',
  })
  vendedorSenaLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrcodeService.obterQrcodeSenaVendedorLink(id);
  }

  @Get('sena/distribuidor/:id')
  @Header('Content-Type', 'image/png')
  @ApiOperation({
    summary: 'Obter QR Code Sena do distribuidor (PNG) (ADMIN)',
  })
  async distribuidorSena(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.qrcodeService.gerarQrcodeSenaDistribuidor(id);
    return new StreamableFile(buffer, { type: 'image/png' });
  }

  @Get('sena/distribuidor/:id/link')
  @ApiOperation({
    summary: 'Obter link persistido do QR Code Sena do distribuidor (ADMIN)',
  })
  distribuidorSenaLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrcodeService.obterQrcodeSenaDistribuidorLink(id);
  }

  @Get('vendedor/:id')
  @Header('Content-Type', 'image/png')
  @ApiOperation({ summary: 'Obter QR Code do vendedor (PNG) (ADMIN)' })
  async vendedor(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.qrcodeService.gerarQrcodeVendedor(id);
    return new StreamableFile(buffer, { type: 'image/png' });
  }

  @Get('vendedor/:id/link')
  @ApiOperation({
    summary: 'Obter link persistido do QR Code do vendedor (ADMIN)',
  })
  vendedorLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrcodeService.obterQrcodeVendedorLink(id);
  }

  @Get('distribuidor/:id')
  @Header('Content-Type', 'image/png')
  @ApiOperation({ summary: 'Obter QR Code do distribuidor (PNG) (ADMIN)' })
  async distribuidor(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.qrcodeService.gerarQrcodeDistribuidor(id);
    return new StreamableFile(buffer, { type: 'image/png' });
  }

  @Get('distribuidor/:id/link')
  @ApiOperation({
    summary: 'Obter link persistido do QR Code do distribuidor (ADMIN)',
  })
  distribuidorLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.qrcodeService.obterQrcodeDistribuidorLink(id);
  }
}
