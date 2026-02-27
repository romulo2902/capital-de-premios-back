import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class QrcodeService {
  private readonly logger = new Logger(QrcodeService.name);
  private readonly s3: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION', 'sa-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async gerarQrcodeVendedor(id: string): Promise<Buffer> {
    const vendedor = await this.prisma.vendedor.findUnique({ where: { id } });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

    const appUrl = this.config.get<string>('FRONTEND_LOJA_URL', 'http://localhost:3001');
    const link = vendedor.link ?? `${appUrl}?ref=${vendedor.codigo}`;

    const buffer = await qrcode.toBuffer(link, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    // Upload to S3 and save URL
    await this.uploadQrcode(buffer, `vendedores/${id}/qrcode.png`);

    await this.prisma.vendedor.update({
      where: { id },
      data: { qrcode: `https://${this.config.get('AWS_BUCKET_NAME')}.s3.amazonaws.com/vendedores/${id}/qrcode.png` },
    });

    this.logger.log(`QR Code gerado para vendedor ${id}`);
    return buffer;
  }

  async gerarQrcodeDistribuidor(id: string): Promise<Buffer> {
    const distribuidor = await this.prisma.distribuidor.findUnique({ where: { id } });
    if (!distribuidor) throw new NotFoundException('Distribuidor não encontrado');

    const appUrl = this.config.get<string>('FRONTEND_LOJA_URL', 'http://localhost:3001');
    const link = distribuidor.link ?? `${appUrl}?dist=${id}`;

    const buffer = await qrcode.toBuffer(link, {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    await this.uploadQrcode(buffer, `distribuidores/${id}/qrcode.png`);

    await this.prisma.distribuidor.update({
      where: { id },
      data: { qrcode: `https://${this.config.get('AWS_BUCKET_NAME')}.s3.amazonaws.com/distribuidores/${id}/qrcode.png` },
    });

    this.logger.log(`QR Code gerado para distribuidor ${id}`);
    return buffer;
  }

  private async uploadQrcode(buffer: Buffer, key: string): Promise<void> {
    const bucket = this.config.get<string>('AWS_BUCKET_NAME', '');
    if (!bucket) return; // skip upload if not configured

    try {
      await this.s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
        ACL: 'public-read',
      }));
    } catch (err) {
      this.logger.warn(`Falha ao fazer upload do QR Code para S3: ${(err as Error).message}`);
    }
  }
}
