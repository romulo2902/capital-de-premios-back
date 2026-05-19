import { Test, TestingModule } from '@nestjs/testing';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

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

  it('create should vincular cliente ao vendedor autenticado', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
    mockPrisma.vendedor.findUnique.mockResolvedValueOnce({
      id: 'vendedor-logado',
      distribuidorId: 'distribuidor-1',
    });
    mockPrisma.cliente.create.mockResolvedValue({
      id: 'cliente-1',
      vendedorId: 'vendedor-logado',
      distribuidorId: 'distribuidor-1',
    });

    await service.create(
      {
        cpf: '200.074.694-20',
        nome: 'Cliente Teste',
        telefone: '(84) 99999-9999',
        dataNascimento: '1990-01-01',
      },
      {
        id: 'usuario-1',
        email: 'vend@test.com',
        cpf: '12345678900',
        perfil: 'VENDEDOR',
        status: 'ATIVO',
        vendedorId: 'vendedor-logado',
      },
    );

    expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendedorId: 'vendedor-logado',
          distribuidorId: 'distribuidor-1',
        }),
      }),
    );
  });

  it('create should impedir distribuidor de usar vendedor fora da propria rede', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
    mockPrisma.vendedor.findUnique.mockResolvedValueOnce({
      id: 'vendedor-externo',
      distribuidorId: 'distribuidor-externo',
    });

    await expect(
      service.create(
        {
          cpf: '200.074.694-20',
          nome: 'Cliente Teste',
          telefone: '(84) 99999-9999',
          dataNascimento: '1990-01-01',
          vendedorId: 'vendedor-externo',
        },
        {
          id: 'usuario-2',
          email: 'dist@test.com',
          cpf: '12345678900',
          perfil: 'DISTRIBUIDOR',
          status: 'ATIVO',
          distribuidorId: 'distribuidor-1',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create should exigir data de nascimento', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.create(
        {
          cpf: '200.074.694-20',
          nome: 'Cliente Teste',
          telefone: '(84) 99999-9999',
        },
        {
          id: 'usuario-1',
          email: 'admin@test.com',
          cpf: '12345678900',
          perfil: 'ADMIN',
          status: 'ATIVO',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('update should normalize empty distribuidorId to null', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Cliente Teste',
      vendedorId: 'vendedor-1',
      distribuidorId: 'distribuidor-1',
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-1',
      nome: 'Vendedor Teste',
      distribuidorId: 'distribuidor-1',
    });
    mockPrisma.cliente.update.mockResolvedValue({
      id: 'cliente-1',
      vendedorId: 'vendedor-1',
      distribuidorId: 'distribuidor-1',
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
          distribuidorId: 'distribuidor-1',
        }),
      }),
    );
  });

  it('update should manter vendedor e distribuidor quando ambos sao informados', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce({
      id: 'cliente-2',
      nome: 'Cliente Teste 2',
      vendedorId: null,
      distribuidorId: null,
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-2',
      nome: 'Vendedor Teste 2',
      distribuidorId: 'distribuidor-2',
    });
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'distribuidor-2',
      nome: 'Distribuidor Teste 2',
    });
    mockPrisma.cliente.update.mockResolvedValue({
      id: 'cliente-2',
      vendedorId: 'vendedor-2',
      distribuidorId: 'distribuidor-2',
    });

    await service.update('cliente-2', {
      vendedorId: 'vendedor-2',
      distribuidorId: 'distribuidor-2',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cliente-2' },
        data: expect.objectContaining({
          vendedorId: 'vendedor-2',
          distribuidorId: 'distribuidor-2',
        }),
      }),
    );
  });

  it('update should reject vendedor vinculado a outro distribuidor', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce({
      id: 'cliente-3',
      nome: 'Cliente Teste 3',
      vendedorId: null,
      distribuidorId: null,
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-3',
      nome: 'Vendedor Teste 3',
      distribuidorId: 'distribuidor-correto',
    });
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'distribuidor-incorreto',
      nome: 'Distribuidor Incorreto',
    });

    await expect(
      service.update('cliente-3', {
        vendedorId: 'vendedor-3',
        distribuidorId: 'distribuidor-incorreto',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
