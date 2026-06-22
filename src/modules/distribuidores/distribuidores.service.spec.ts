import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { DistribuidoresService } from './distribuidores.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { QrcodeService } from '../qrcode/qrcode.service';

describe('DistribuidoresService', () => {
  let service: DistribuidoresService;

  const mockPrisma = {
    $transaction: jest.fn(),
    distribuidor: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    usuario: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockQrcodeService = {
    gerarQrcodeDistribuidor: jest.fn().mockResolvedValue(undefined),
    gerarQrcodeSenaDistribuidor: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) =>
      callback(mockPrisma as typeof mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistribuidoresService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QrcodeService, useValue: mockQrcodeService },
      ],
    }).compile();

    service = module.get<DistribuidoresService>(DistribuidoresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.distribuidor.findMany.mockResolvedValue([]);
    mockPrisma.distribuidor.count.mockResolvedValue(0);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      lastPage: 0,
    });
  });

  it('create should normalize cpf and email before persisting', async () => {
    mockPrisma.distribuidor.findFirst.mockResolvedValue(null);
    mockPrisma.usuario.findFirst.mockResolvedValue(null);
    mockPrisma.usuario.create.mockResolvedValue({ id: 'usuario-1' });
    mockPrisma.distribuidor.create.mockResolvedValue({
      id: 'dist-1',
      cpf: '03363812809',
      email: 'arrobaarroba.com',
    });

    await service.create({
      nome: 'Tiago Lima',
      cpf: '033.638.128-09',
      telefone: '(64) 98461-4339',
      email: 'Arroba@Arroba.com',
    });

    expect(mockPrisma.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpf: '03363812809',
          email: 'arroba@arroba.com',
        }),
      }),
    );
    expect(mockPrisma.distribuidor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpf: '03363812809',
          email: 'arroba@arroba.com',
        }),
      }),
    );
    const usuarioCreatePayload = mockPrisma.usuario.create.mock.calls[0][0] as {
      data: { senhaHash: string };
    };
    expect(await bcrypt.compare('033638', usuarioCreatePayload.data.senhaHash))
      .toBe(true);
    expect(mockQrcodeService.gerarQrcodeDistribuidor).toHaveBeenCalledWith(
      'dist-1',
    );
    expect(
      mockQrcodeService.gerarQrcodeSenaDistribuidor,
    ).toHaveBeenCalledWith('dist-1');
  });

  it('create should reject cpf already present in usuario table', async () => {
    mockPrisma.distribuidor.findFirst.mockResolvedValue(null);
    mockPrisma.usuario.findFirst.mockResolvedValueOnce({ id: 'usuario-existente' });

    await expect(
      service.create({
        nome: 'Tiago Lima',
        cpf: '033.638.128-09',
        telefone: '(64) 98461-4339',
        email: 'novo@email.com',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
