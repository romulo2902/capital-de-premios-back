import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { QrcodeService } from './qrcode.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Admin / QR Code')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DISTRIBUIDOR')
@Controller('admin/qrcode')
export class QrcodeController {
  constructor(private readonly qrcodeService: QrcodeService) {}

  @Get('vendedor/:id')
  @ApiOperation({ summary: 'Gerar QR Code do vendedor (ADMIN + DISTRIBUIDOR)' })
  async vendedor(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.qrcodeService.gerarQrcodeVendedor(id);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  }

  @Get('distribuidor/:id')
  @ApiOperation({ summary: 'Gerar QR Code do distribuidor (ADMIN + DISTRIBUIDOR)' })
  async distribuidor(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.qrcodeService.gerarQrcodeDistribuidor(id);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  }
}
