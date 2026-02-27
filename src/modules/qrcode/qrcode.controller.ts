import { Controller, Get, Param, UseGuards, Header, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QrcodeService } from './qrcode.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin / QR Code')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/qrcode')
export class QrcodeController {
  constructor(private readonly qrcodeService: QrcodeService) {}

  @Get('vendedor/:id')
  @Header('Content-Type', 'image/png')
  @ApiOperation({ summary: 'Gerar QR Code do vendedor (PNG) (ADMIN)' })
  async vendedor(@Param('id') id: string): Promise<StreamableFile> {
    const buffer = await this.qrcodeService.gerarQrcodeVendedor(id);
    return new StreamableFile(buffer, { type: 'image/png' });
  }

  @Get('distribuidor/:id')
  @Header('Content-Type', 'image/png')
  @ApiOperation({ summary: 'Gerar QR Code do distribuidor (PNG) (ADMIN)' })
  async distribuidor(@Param('id') id: string): Promise<StreamableFile> {
    const buffer = await this.qrcodeService.gerarQrcodeDistribuidor(id);
    return new StreamableFile(buffer, { type: 'image/png' });
  }
}
