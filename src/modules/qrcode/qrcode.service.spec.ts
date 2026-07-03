import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3UploadService } from '../../common/s3/s3-upload.service';
import { ModoAtualizacaoQrcode, QrcodeService } from './qrcode.service';
import * as qrcode from 'qrcode';

jest.mock('qrcode', () => ({
  toBuffer: jest.fn(),
}));

describe('QrcodeService', () => {
  let service: QrcodeService;

  const mockPrisma = {
    vendedor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    distribuidor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'URL_LOJA_CLIENTE') {
        return 'https://loja.capitalpremios.com.br';
      }

      if (key === 'FRONTEND_LOJA_SENA_URL') {
        return 'https://sena.capitalpremios.com.br';
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should gerar e salvar o qrcode do vendedor quando ainda nao existir', async () => {
    const buffer = Buffer.from('png-vendedor');

    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vend-1',
      usuarioId: 'cfda6bc8-665d-4735-a217-3f51775d431c',
      codigo: 123,
      nome: 'João Vendedor',
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
      'https://loja.capitalpremios.com.br/?seller_id=vend-1&seller_name=Jo%C3%A3o+Vendedor',
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
        link: 'https://loja.capitalpremios.com.br/?seller_id=vend-1&seller_name=Jo%C3%A3o+Vendedor',
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
      usuarioId: 'd7ee8b71-0574-4795-bfbb-114ff941aa70',
      codigo: 456,
      nome: 'Maria Vendedora',
      link: 'https://loja.capitalpremios.com.br/?seller_id=vend-2&seller_name=Maria+Vendedora',
      qrcode:
        'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-2/qrcode.png',
    });

    const result = await service.obterQrcodeVendedorLink('vend-2');

    expect(qrcode.toBuffer).not.toHaveBeenCalled();
    expect(mockS3UploadService.uploadPublicObject).not.toHaveBeenCalled();
    expect(result.data.qrcodeUrl).toBe(
      'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-2/qrcode.png',
    );
    expect(result.data.link).toBe(
      'https://loja.capitalpremios.com.br/?seller_id=vend-2&seller_name=Maria+Vendedora',
    );
    expect(result.message).toBe('QR Code do vendedor disponível com sucesso');
  });

  it('deve gerar e salvar o QR Code Sena do vendedor usando a URL da loja Sena', async () => {
    const buffer = Buffer.from('png-vendedor-sena');

    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vend-sena-1',
      nome: 'João Vendedor',
      linkSena: null,
      qrcodeSena: null,
    });
    (qrcode.toBuffer as jest.Mock).mockResolvedValue(buffer);
    mockS3UploadService.uploadPublicObject.mockResolvedValue(
      'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-sena-1/qrcode-sena.png',
    );

    const result = await service.gerarQrcodeSenaVendedor('vend-sena-1');

    expect(qrcode.toBuffer).toHaveBeenCalledWith(
      'https://sena.capitalpremios.com.br/?seller_id=vend-sena-1&seller_name=Jo%C3%A3o+Vendedor',
      expect.any(Object),
    );
    expect(mockS3UploadService.uploadPublicObject).toHaveBeenCalledWith({
      body: buffer,
      contentType: 'image/png',
      key: 'vendedores/vend-sena-1/qrcode-sena.png',
    });
    expect(mockPrisma.vendedor.update).toHaveBeenCalledWith({
      where: { id: 'vend-sena-1' },
      data: {
        linkSena:
          'https://sena.capitalpremios.com.br/?seller_id=vend-sena-1&seller_name=Jo%C3%A3o+Vendedor',
        qrcodeSena:
          'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-sena-1/qrcode-sena.png',
      },
    });
    expect(result).toEqual({
      buffer,
      qrcodeUrl:
        'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-sena-1/qrcode-sena.png',
    });
  });

  it('deve retornar link e QR Code Sena do distribuidor autenticado', async () => {
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'dist-sena-1',
      nome: 'Distribuidor Sena',
      linkSena:
        'https://sena.capitalpremios.com.br/?seller_id=dist-sena-1&seller_name=Distribuidor+Sena',
      qrcodeSena:
        'https://bucket.s3.sa-east-1.amazonaws.com/distribuidores/dist-sena-1/qrcode-sena.png',
    });

    const result = await service.obterMeuQrcodeSena({
      id: 'usuario-distribuidor',
      email: 'distribuidor@test.com',
      cpf: '12345678901',
      perfil: 'DISTRIBUIDOR',
      status: 'ATIVO',
      distribuidorId: 'dist-sena-1',
    });

    expect(result).toEqual({
      message: 'Link e QR Code Sena disponíveis com sucesso',
      data: {
        tipo: 'DISTRIBUIDOR',
        sellerId: 'dist-sena-1',
        link: 'https://sena.capitalpremios.com.br/?seller_id=dist-sena-1&seller_name=Distribuidor+Sena',
        qrcodeUrl:
          'https://bucket.s3.sa-east-1.amazonaws.com/distribuidores/dist-sena-1/qrcode-sena.png',
        reused: true,
      },
    });
    expect(qrcode.toBuffer).not.toHaveBeenCalled();
  });

  it('should retornar link e qrcode do vendedor autenticado', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vend-3',
      usuarioId: 'usuario-vendedor',
      codigo: 789,
      nome: 'Vendedor Logado',
      link: 'https://loja.capitalpremios.com.br/?seller_id=vend-3&seller_name=Vendedor+Logado',
      qrcode:
        'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-3/qrcode.png',
    });

    const result = await service.obterMeuQrcode({
      id: 'usuario-vendedor',
      email: 'vendedor@test.com',
      cpf: '12345678901',
      perfil: 'VENDEDOR',
      status: 'ATIVO',
      vendedorId: 'vend-3',
    });

    expect(result).toEqual({
      message: 'Link e QR Code disponíveis com sucesso',
      data: {
        tipo: 'VENDEDOR',
        sellerId: 'vend-3',
        link: 'https://loja.capitalpremios.com.br/?seller_id=vend-3&seller_name=Vendedor+Logado',
        qrcodeUrl:
          'https://bucket.s3.sa-east-1.amazonaws.com/vendedores/vend-3/qrcode.png',
        reused: true,
      },
    });
  });

  it('should lançar not found quando distribuidor nao existir', async () => {
    mockPrisma.distribuidor.findUnique.mockResolvedValue(null);

    await expect(service.obterQrcodeDistribuidorLink('dist-1')).rejects.toThrow(
      new NotFoundException('Distribuidor não encontrado'),
    );
  });

  it('deve criar somente QR Codes ausentes e preservar os existentes por padrao', async () => {
    mockPrisma.vendedor.findMany.mockResolvedValue([
      {
        id: 'vend-completo',
        nome: 'Vendedor Completo',
        link: 'https://loja.test/vend-completo',
        qrcode: 'https://s3.test/vend-completo-cdp.png',
        linkSena: 'https://sena.test/vend-completo',
        qrcodeSena: 'https://s3.test/vend-completo-sena.png',
      },
      {
        id: 'vend-incompleto',
        nome: 'Vendedor Incompleto',
        link: null,
        qrcode: 'https://s3.test/vend-incompleto-cdp.png',
        linkSena: null,
        qrcodeSena: null,
      },
    ]);
    mockPrisma.distribuidor.findMany.mockResolvedValue([
      {
        id: 'dist-completo',
        nome: 'Distribuidor Completo',
        link: 'https://loja.test/dist-completo',
        qrcode: 'https://s3.test/dist-completo-cdp.png',
        linkSena: 'https://sena.test/dist-completo',
        qrcodeSena: 'https://s3.test/dist-completo-sena.png',
      },
    ]);
    const gerarCdpVendedor = jest
      .spyOn(service, 'gerarQrcodeVendedor')
      .mockResolvedValue({ buffer: Buffer.from('cdp'), qrcodeUrl: 'cdp' });
    const gerarSenaVendedor = jest
      .spyOn(service, 'gerarQrcodeSenaVendedor')
      .mockResolvedValue({ buffer: Buffer.from('sena'), qrcodeUrl: 'sena' });
    const gerarCdpDistribuidor = jest.spyOn(service, 'gerarQrcodeDistribuidor');
    const gerarSenaDistribuidor = jest.spyOn(
      service,
      'gerarQrcodeSenaDistribuidor',
    );

    const resultado = await service.atualizarLinksEQrcodesSellers();

    expect(gerarCdpVendedor).not.toHaveBeenCalled();
    expect(gerarSenaVendedor).toHaveBeenCalledTimes(1);
    expect(gerarSenaVendedor).toHaveBeenCalledWith('vend-incompleto');
    expect(gerarCdpDistribuidor).not.toHaveBeenCalled();
    expect(gerarSenaDistribuidor).not.toHaveBeenCalled();
    expect(mockPrisma.vendedor.update).toHaveBeenCalledWith({
      where: { id: 'vend-incompleto' },
      data: {
        link: 'https://loja.capitalpremios.com.br/?seller_id=vend-incompleto&seller_name=Vendedor+Incompleto',
      },
    });
    expect(resultado).toEqual({
      modo: ModoAtualizacaoQrcode.CRIAR_AUSENTES,
      vendedoresAtualizados: 1,
      vendedoresPreservados: 1,
      distribuidoresAtualizados: 0,
      distribuidoresPreservados: 1,
      erros: [],
    });
  });

  it('deve recriar todos os QR Codes somente no modo explicito', async () => {
    mockPrisma.vendedor.findMany.mockResolvedValue([
      {
        id: 'vend-1',
        nome: 'Vendedor 1',
        link: 'link-cdp',
        qrcode: 'qrcode-cdp',
        linkSena: 'link-sena',
        qrcodeSena: 'qrcode-sena',
      },
    ]);
    mockPrisma.distribuidor.findMany.mockResolvedValue([
      {
        id: 'dist-1',
        nome: 'Distribuidor 1',
        link: 'link-cdp',
        qrcode: 'qrcode-cdp',
        linkSena: 'link-sena',
        qrcodeSena: 'qrcode-sena',
      },
    ]);
    const retorno = { buffer: Buffer.from('qr'), qrcodeUrl: 'qrcode' };
    const gerarCdpVendedor = jest
      .spyOn(service, 'gerarQrcodeVendedor')
      .mockResolvedValue(retorno);
    const gerarSenaVendedor = jest
      .spyOn(service, 'gerarQrcodeSenaVendedor')
      .mockResolvedValue(retorno);
    const gerarCdpDistribuidor = jest
      .spyOn(service, 'gerarQrcodeDistribuidor')
      .mockResolvedValue(retorno);
    const gerarSenaDistribuidor = jest
      .spyOn(service, 'gerarQrcodeSenaDistribuidor')
      .mockResolvedValue(retorno);

    const resultado = await service.atualizarLinksEQrcodesSellers(
      ModoAtualizacaoQrcode.RECRIAR_TODOS,
    );

    expect(gerarCdpVendedor).toHaveBeenCalledWith('vend-1', { force: true });
    expect(gerarSenaVendedor).toHaveBeenCalledWith('vend-1', { force: true });
    expect(gerarCdpDistribuidor).toHaveBeenCalledWith('dist-1', {
      force: true,
    });
    expect(gerarSenaDistribuidor).toHaveBeenCalledWith('dist-1', {
      force: true,
    });
    expect(resultado).toEqual({
      modo: ModoAtualizacaoQrcode.RECRIAR_TODOS,
      vendedoresAtualizados: 1,
      vendedoresPreservados: 0,
      distribuidoresAtualizados: 1,
      distribuidoresPreservados: 0,
      erros: [],
    });
  });
});
