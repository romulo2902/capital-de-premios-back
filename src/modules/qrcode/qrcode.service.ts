import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { S3UploadService } from '../../common/s3/s3-upload.service';

interface QrcodeGerado {
  buffer: Buffer;
  qrcodeUrl: string;
}

@Injectable()
export class QrcodeService {
  private readonly logger = new Logger(QrcodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async gerarQrcodeVendedor(id: string): Promise<QrcodeGerado> {
    const vendedor = await this.prisma.vendedor.findUnique({ where: { id } });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

    if (vendedor.qrcode) {
      const existingBuffer = await this.obterBufferPorUrl(vendedor.qrcode);
      if (existingBuffer) {
        this.logger.log(`QR Code reutilizado para vendedor ${id}`);
        return {
          buffer: existingBuffer,
          qrcodeUrl: vendedor.qrcode,
        };
      }
    }

    const appUrl = this.config.get<string>(
      'FRONTEND_LOJA_URL',
      'http://localhost:3001',
    );
    const link = vendedor.link ?? `${appUrl}?ref=${vendedor.codigo}`;

    const buffer = await qrcode.toBuffer(link, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    const qrcodeUrl = await this.s3UploadService.uploadPublicObject({
      body: buffer,
      contentType: 'image/png',
      key: `vendedores/${id}/qrcode.png`,
    });

    await this.prisma.vendedor.update({
      where: { id },
      data: {
        qrcode: qrcodeUrl,
      },
    });

    this.logger.log(`QR Code gerado para vendedor ${id}`);
    return { buffer, qrcodeUrl };
  }

  async obterQrcodeVendedorLink(id: string) {
    const vendedor = await this.prisma.vendedor.findUnique({ where: { id } });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

    if (vendedor.qrcode) {
      return {
        message: 'QR Code do vendedor disponível com sucesso',
        data: {
          qrcodeUrl: vendedor.qrcode,
          reused: true,
        },
      };
    }

    const { qrcodeUrl } = await this.gerarQrcodeVendedor(id);
    return {
      message: 'QR Code do vendedor gerado com sucesso',
      data: {
        qrcodeUrl,
        reused: false,
      },
    };
  }

  async gerarQrcodeDistribuidor(id: string): Promise<QrcodeGerado> {
    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');

    if (distribuidor.qrcode) {
      const existingBuffer = await this.obterBufferPorUrl(distribuidor.qrcode);
      if (existingBuffer) {
        this.logger.log(`QR Code reutilizado para distribuidor ${id}`);
        return {
          buffer: existingBuffer,
          qrcodeUrl: distribuidor.qrcode,
        };
      }
    }

    const appUrl = this.config.get<string>(
      'FRONTEND_LOJA_URL',
      'http://localhost:3001',
    );
    const link = distribuidor.link ?? `${appUrl}?dist=${id}`;

    const buffer = await qrcode.toBuffer(link, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    const qrcodeUrl = await this.s3UploadService.uploadPublicObject({
      body: buffer,
      contentType: 'image/png',
      key: `distribuidores/${id}/qrcode.png`,
    });

    await this.prisma.distribuidor.update({
      where: { id },
      data: {
        qrcode: qrcodeUrl,
      },
    });

    this.logger.log(`QR Code gerado para distribuidor ${id}`);
    return { buffer, qrcodeUrl };
  }

  async obterQrcodeDistribuidorLink(id: string) {
    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');

    if (distribuidor.qrcode) {
      return {
        message: 'QR Code do distribuidor disponível com sucesso',
        data: {
          qrcodeUrl: distribuidor.qrcode,
          reused: true,
        },
      };
    }

    const { qrcodeUrl } = await this.gerarQrcodeDistribuidor(id);
    return {
      message: 'QR Code do distribuidor gerado com sucesso',
      data: {
        qrcodeUrl,
        reused: false,
      },
    };
  }

  private async obterBufferPorUrl(qrcodeUrl: string): Promise<Buffer | null> {
    try {
      const response = await fetch(qrcodeUrl);

      if (!response.ok) {
        this.logger.warn(
          `QR Code em ${qrcodeUrl} não pôde ser reutilizado: status ${response.status}`,
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.warn(
        `Falha ao reutilizar QR Code salvo: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
