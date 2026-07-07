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

  it('buscarMeusDados should retornar dados sensiveis mascarados por CPF', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Tiago Lima',
      cpf: '03112345675',
      email: 'tiago@hotmail.com',
      telefone: '(64) 98461-4339',
      dataNascimento: new Date('1990-05-20T00:00:00.000Z'),
    });

    const result = await service.buscarMeusDados('031.123.456-75');

    expect(mockPrisma.cliente.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ cpf: '03112345675' }, { cpf: '031.123.456-75' }],
      },
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        telefone: true,
        dataNascimento: true,
      },
    });
    expect(result).toEqual({
      message: 'Dados do cliente encontrados',
      data: {
        cliente: {
          id: 'cliente-1',
          nome: 'Tiago Lima',
          cpf: '031.***.***-75',
          cpfMascarado: '031.***.***-75',
          email: 'tia***@hotmail.com',
          emailMascarado: 'tia***@hotmail.com',
          telefone: '(64) 98461-4339',
          dataNascimento: '1990-05-20',
        },
      },
    });
  });

  it('atualizarMeusDados should atualizar pelo id e retornar mascarado', async () => {
    mockPrisma.cliente.update.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Tiago Lima',
      cpf: '03112345675',
      email: 'tiago.novo@hotmail.com',
      telefone: '(64) 98461-4339',
      dataNascimento: new Date('1990-05-20T00:00:00.000Z'),
    });

    const result = await service.atualizarMeusDados('cliente-1', {
      nome: ' Tiago Lima ',
      email: 'TIAGO.NOVO@HOTMAIL.COM',
      telefone: ' (64) 98461-4339 ',
      dataNascimento: '1990-05-20',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 'cliente-1' },
      data: {
        nome: 'Tiago Lima',
        email: 'tiago.novo@hotmail.com',
        telefone: '(64) 98461-4339',
        dataNascimento: new Date('1990-05-20T00:00:00.000Z'),
      },
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        telefone: true,
        dataNascimento: true,
      },
    });
    expect(result.data.cliente).toEqual({
      id: 'cliente-1',
      nome: 'Tiago Lima',
      cpf: '031.***.***-75',
      cpfMascarado: '031.***.***-75',
      email: 'tia***@hotmail.com',
      emailMascarado: 'tia***@hotmail.com',
      telefone: '(64) 98461-4339',
      dataNascimento: '1990-05-20',
    });
  });

  it('atualizarMeusDados should exigir ao menos um campo', async () => {
    await expect(service.atualizarMeusDados('cliente-1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('findAll should limitar clientes ao vendedor autenticado', async () => {
    mockPrisma.cliente.findMany.mockResolvedValue([]);
    mockPrisma.cliente.count.mockResolvedValue(0);

    await service.findAll(1, 20, undefined, undefined, undefined, {
      id: 'usuario-vendedor',
      email: 'vend@test.com',
      cpf: '12345678900',
      perfil: 'VENDEDOR',
      status: 'ATIVO',
      vendedorId: 'vendedor-1',
    });

    expect(mockPrisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { vendedorId: 'vendedor-1' },
      }),
    );
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
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
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
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
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
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
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

  it('findOne should nao retornar cliente fora do distribuidor autenticado', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('cliente-1', {
        id: 'usuario-dist',
        email: 'dist@test.com',
        cpf: '12345678900',
        perfil: 'DISTRIBUIDOR',
        status: 'ATIVO',
        distribuidorId: 'distribuidor-1',
      }),
    ).rejects.toThrow('Cliente não encontrado');

    expect(mockPrisma.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ id: 'cliente-1' }, { distribuidorId: 'distribuidor-1' }],
        },
      }),
    );
  });
});
