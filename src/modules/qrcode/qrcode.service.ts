import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { S3UploadService } from '../../common/s3/s3-upload.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

interface QrcodeGerado {
  buffer: Buffer;
  qrcodeUrl: string;
}

interface GerarQrcodeOptions {
  force?: boolean;
}

interface AtualizacaoQrcodeSellersResultado {
  vendedoresAtualizados: number;
  distribuidoresAtualizados: number;
  erros: Array<{
    tipo: 'VENDEDOR' | 'DISTRIBUIDOR';
    id: string;
    motivo: string;
  }>;
}

type MeuQrcodeTipo = 'VENDEDOR' | 'DISTRIBUIDOR';

@Injectable()
export class QrcodeService {
  private readonly logger = new Logger(QrcodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3UploadService: S3UploadService,
  ) {}

  async gerarQrcodeVendedor(
    id: string,
    options: GerarQrcodeOptions = {},
  ): Promise<QrcodeGerado> {
    const vendedor = await this.prisma.vendedor.findUnique({ where: { id } });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

    const link = this.criarLinkLoja(vendedor.id, vendedor.nome);

    if (!options.force && vendedor.qrcode && vendedor.link === link) {
      const existingBuffer = await this.obterBufferPorUrl(vendedor.qrcode);
      if (existingBuffer) {
        this.logger.log(`QR Code reutilizado para vendedor ${id}`);
        return {
          buffer: existingBuffer,
          qrcodeUrl: vendedor.qrcode,
        };
      }
    }

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
        link,
        qrcode: qrcodeUrl,
      },
    });

    this.logger.log(`QR Code gerado para vendedor ${id}`);
    return { buffer, qrcodeUrl };
  }

  async obterQrcodeVendedorLink(id: string) {
    const vendedor = await this.prisma.vendedor.findUnique({ where: { id } });
    if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

    const link = this.criarLinkLoja(vendedor.id, vendedor.nome);

    if (vendedor.qrcode && vendedor.link === link) {
      return {
        message: 'QR Code do vendedor disponível com sucesso',
        data: {
          link,
          qrcodeUrl: vendedor.qrcode,
          reused: true,
        },
      };
    }

    const { qrcodeUrl } = await this.gerarQrcodeVendedor(id);
    return {
      message: 'QR Code do vendedor gerado com sucesso',
      data: {
        link,
        qrcodeUrl,
        reused: false,
      },
    };
  }

  async gerarQrcodeDistribuidor(
    id: string,
    options: GerarQrcodeOptions = {},
  ): Promise<QrcodeGerado> {
    const distribuidor = await this.prisma.distribuidor.findUnique({
      where: { id },
    });
    if (!distribuidor)
      throw new NotFoundException('Distribuidor não encontrado');

    const link = this.criarLinkLoja(distribuidor.id, distribuidor.nome);

    if (!options.force && distribuidor.qrcode && distribuidor.link === link) {
      const existingBuffer = await this.obterBufferPorUrl(distribuidor.qrcode);
      if (existingBuffer) {
        this.logger.log(`QR Code reutilizado para distribuidor ${id}`);
        return {
          buffer: existingBuffer,
          qrcodeUrl: distribuidor.qrcode,
        };
      }
    }

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
        link,
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

    const link = this.criarLinkLoja(distribuidor.id, distribuidor.nome);

    if (distribuidor.qrcode && distribuidor.link === link) {
      return {
        message: 'QR Code do distribuidor disponível com sucesso',
        data: {
          link,
          qrcodeUrl: distribuidor.qrcode,
          reused: true,
        },
      };
    }

    const { qrcodeUrl } = await this.gerarQrcodeDistribuidor(id);
    return {
      message: 'QR Code do distribuidor gerado com sucesso',
      data: {
        link,
        qrcodeUrl,
        reused: false,
      },
    };
  }

  async obterMeuQrcode(user: RequestUser) {
    const tipo = this.resolverTipoSellerDoUsuario(user);
    const sellerId =
      tipo === 'VENDEDOR' ? user.vendedorId : user.distribuidorId;

    if (!sellerId) {
      throw new NotFoundException(
        'Vínculo de vendedor/distribuidor não encontrado para este usuário',
      );
    }

    const resultado =
      tipo === 'VENDEDOR'
        ? await this.obterQrcodeVendedorLink(sellerId)
        : await this.obterQrcodeDistribuidorLink(sellerId);

    return {
      message: 'Link e QR Code disponíveis com sucesso',
      data: {
        tipo,
        sellerId,
        ...resultado.data,
      },
    };
  }

  async atualizarLinksEQrcodesSellers(): Promise<AtualizacaoQrcodeSellersResultado> {
    const resultado: AtualizacaoQrcodeSellersResultado = {
      vendedoresAtualizados: 0,
      distribuidoresAtualizados: 0,
      erros: [],
    };

    const [vendedores, distribuidores] = await Promise.all([
      this.prisma.vendedor.findMany({ select: { id: true } }),
      this.prisma.distribuidor.findMany({ select: { id: true } }),
    ]);

    for (const vendedor of vendedores) {
      try {
        await this.gerarQrcodeVendedor(vendedor.id, { force: true });
        resultado.vendedoresAtualizados += 1;
      } catch (error) {
        resultado.erros.push({
          tipo: 'VENDEDOR',
          id: vendedor.id,
          motivo: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const distribuidor of distribuidores) {
      try {
        await this.gerarQrcodeDistribuidor(distribuidor.id, { force: true });
        resultado.distribuidoresAtualizados += 1;
      } catch (error) {
        resultado.erros.push({
          tipo: 'DISTRIBUIDOR',
          id: distribuidor.id,
          motivo: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(
      `Backfill de QR Codes finalizado: ${resultado.vendedoresAtualizados} vendedor(es), ${resultado.distribuidoresAtualizados} distribuidor(es), ${resultado.erros.length} erro(s)`,
    );

    return resultado;
  }

  criarLinkLoja(sellerId: string, sellerName: string): string {
    const baseUrl = (
      this.config.get<string>('URL_LOJA_CLIENTE')?.trim() ||
      this.config.get<string>('FRONTEND_LOJA_URL')?.trim() ||
      'http://localhost:3001'
    ).replace(/\/+$/, '');

    const url = new URL(baseUrl);
    url.searchParams.set('seller_id', sellerId);
    url.searchParams.set('seller_name', sellerName);

    return url.toString();
  }

  private resolverTipoSellerDoUsuario(user: RequestUser): MeuQrcodeTipo {
    if (user.perfil === 'VENDEDOR') {
      return 'VENDEDOR';
    }

    if (user.perfil === 'DISTRIBUIDOR') {
      return 'DISTRIBUIDOR';
    }

    throw new ForbiddenException(
      'Acesso permitido apenas para DISTRIBUIDOR ou VENDEDOR',
    );
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
