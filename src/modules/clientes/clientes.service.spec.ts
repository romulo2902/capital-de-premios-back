import { Test, TestingModule } from '@nestjs/testing';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ClientesService', () => {
  let service: ClientesService;

  const mockPrisma = {
    cliente: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    vendedor: {
      findUnique: jest.fn(),
    },
    distribuidor: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.cliente.findMany.mockResolvedValue([]);
    mockPrisma.cliente.count.mockResolvedValue(0);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      lastPage: 0,
    });
  });

  it('update should normalize empty distribuidorId to null', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Cliente Teste',
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-1',
      nome: 'Vendedor Teste',
    });
    mockPrisma.cliente.update.mockResolvedValue({
      id: 'cliente-1',
      vendedorId: 'vendedor-1',
      distribuidorId: null,
    });

    await service.update('cliente-1', {
      vendedorId: 'vendedor-1',
      distribuidorId: '',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cliente-1' },
        data: expect.objectContaining({
          vendedorId: 'vendedor-1',
          distribuidorId: null,
        }),
      }),
    );
  });

  it('update should clear distribuidorId when vendedorId is informado', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce({
      id: 'cliente-2',
      nome: 'Cliente Teste 2',
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-2',
      nome: 'Vendedor Teste 2',
    });
    mockPrisma.cliente.update.mockResolvedValue({
      id: 'cliente-2',
      vendedorId: 'vendedor-2',
      distribuidorId: null,
    });

    await service.update('cliente-2', {
      vendedorId: 'vendedor-2',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cliente-2' },
        data: expect.objectContaining({
          vendedorId: 'vendedor-2',
          distribuidorId: null,
        }),
      }),
    );
  });
});
