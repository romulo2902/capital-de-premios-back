import { Test, TestingModule } from '@nestjs/testing';
import { VendedoresService } from './vendedores.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('VendedoresService', () => {
  let service: VendedoresService;

  const mockPrisma = {
    $transaction: jest.fn(),
    vendedor: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    distribuidor: {
      findUnique: jest.fn(),
    },
    usuario: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => unknown) =>
      callback(mockPrisma as typeof mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendedoresService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VendedoresService>(VendedoresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.vendedor.findMany.mockResolvedValue([]);
    mockPrisma.vendedor.count.mockResolvedValue(0);
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
    mockPrisma.vendedor.findFirst.mockResolvedValue(null);
    mockPrisma.usuario.findFirst.mockResolvedValue(null);
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'dist-1',
      codigo: 10,
    });
    mockPrisma.usuario.create.mockResolvedValue({ id: 'usuario-1' });
    mockPrisma.vendedor.create.mockResolvedValue({
      id: 'vend-1',
      cpf: '03363812809',
      email: 'arroba@arroba.com',
    });

    await service.create({
      distribuidorId: 'dist-1',
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
    expect(mockPrisma.vendedor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cpf: '03363812809',
          email: 'arroba@arroba.com',
        }),
      }),
    );
  });

  it('create should reject cpf already present in usuario table', async () => {
    mockPrisma.vendedor.findFirst.mockResolvedValue(null);
    mockPrisma.usuario.findFirst.mockResolvedValueOnce({ id: 'usuario-existente' });

    await expect(
      service.create({
        distribuidorId: 'dist-1',
        nome: 'Tiago Lima',
        cpf: '033.638.128-09',
        telefone: '(64) 98461-4339',
        email: 'novo@email.com',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
