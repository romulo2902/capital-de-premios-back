import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3UploadService } from '../../common/s3/s3-upload.service';
import { QrcodeService } from './qrcode.service';
import * as qrcode from 'qrcode';

jest.mock('qrcode', () => ({
  toBuffer: jest.fn(),
}));

describe('QrcodeService', () => {
  let service: QrcodeService;

  const mockPrisma = {
    vendedor: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    distribuidor: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'FRONTEND_LOJA_URL') {
        return 'https://loja.capitalpremios.com.br';
      }

      return defaultValue;
    }),
  };

  const mockS3UploadService = {
    uploadPublicObject: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrcodeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: S3UploadService, useValue: mockS3UploadService },
      ],
    }).compile();

    service = module.get<QrcodeService>(QrcodeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should gerar e salvar o qrcode do vendedor quando ainda nao existir', async () => {
    const buffer = Buffer.from('png-vendedor');

    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vend-1',
      codigo: 123,
      link: null,
      qrcode: null,
    });
    (qrcode.toBuffer as jest.Mock).mockResolvedValue(buffer);
    mockS3UploadService.uploadPublicObject.mockResolvedValue(
      'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-1/qrcode.png',
    );
    mockPrisma.vendedor.update.mockResolvedValue({
      id: 'vend-1',
      qrcode:
        'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-1/qrcode.png',
    });

    const result = await service.gerarQrcodeVendedor('vend-1');

    expect(qrcode.toBuffer).toHaveBeenCalledWith(
      'https://loja.capitalpremios.com.br?ref=123',
      expect.any(Object),
    );
    expect(mockS3UploadService.uploadPublicObject).toHaveBeenCalledWith({
      body: buffer,
      contentType: 'image/png',
      key: 'vendedores/vend-1/qrcode.png',
    });
    expect(mockPrisma.vendedor.update).toHaveBeenCalledWith({
      where: { id: 'vend-1' },
      data: {
        qrcode:
          'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-1/qrcode.png',
      },
    });
    expect(result.qrcodeUrl).toBe(
      'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-1/qrcode.png',
    );
    expect(result.buffer).toEqual(buffer);
  });

  it('should reutilizar a url salva do qrcode do vendedor', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vend-2',
      codigo: 456,
      link: 'https://meu-link.com/vendedor',
      qrcode:
        'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-2/qrcode.png',
    });

    const result = await service.obterQrcodeVendedorLink('vend-2');

    expect(qrcode.toBuffer).not.toHaveBeenCalled();
    expect(mockS3UploadService.uploadPublicObject).not.toHaveBeenCalled();
    expect(result.data.qrcodeUrl).toBe(
      'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-2/qrcode.png',
    );
    expect(result.message).toBe('QR Code do vendedor disponível com sucesso');
  });

  it('should lançar not found quando distribuidor nao existir', async () => {
    mockPrisma.distribuidor.findUnique.mockResolvedValue(null);

    await expect(service.obterQrcodeDistribuidorLink('dist-1')).rejects.toThrow(
      new NotFoundException('Distribuidor não encontrado'),
    );
  });
});
