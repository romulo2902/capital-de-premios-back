import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { VendedoresService } from './vendedores.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QrcodeService } from '../qrcode/qrcode.service';

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

  const mockQrcodeService = {
    gerarQrcodeVendedor: jest.fn().mockResolvedValue(undefined),
    gerarQrcodeSenaVendedor: jest.fn().mockResolvedValue(undefined),
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
        { provide: QrcodeService, useValue: mockQrcodeService },
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

  it('findAll should limitar vendedores ao distribuidor autenticado', async () => {
    mockPrisma.vendedor.findMany.mockResolvedValue([]);
    mockPrisma.vendedor.count.mockResolvedValue(0);

    await service.findAll(1, 20, undefined, undefined, {
      id: 'usuario-dist',
      email: 'dist@test.com',
      cpf: '12345678900',
      perfil: 'DISTRIBUIDOR',
      status: 'ATIVO',
      distribuidorId: 'distribuidor-1',
    });

    expect(mockPrisma.vendedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { distribuidorId: 'distribuidor-1' },
      }),
    );
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
    const usuarioCreatePayload = mockPrisma.usuario.create.mock.calls[0][0] as {
      data: { senhaHash: string };
    };
    expect(await bcrypt.compare('033638', usuarioCreatePayload.data.senhaHash))
      .toBe(true);
    expect(mockQrcodeService.gerarQrcodeVendedor).toHaveBeenCalledWith(
      'vend-1',
    );
    expect(mockQrcodeService.gerarQrcodeSenaVendedor).toHaveBeenCalledWith(
      'vend-1',
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
  describe('escopo de rede do DISTRIBUIDOR', () => {
    const distribuidor = {
      id: 'user-dist',
      email: 'dist@x.com',
      cpf: null,
      perfil: 'DISTRIBUIDOR',
      status: 'ATIVO',
      distribuidorId: 'dist-1',
    } as const;

    const admin = {
      id: 'user-admin',
      email: 'admin@x.com',
      cpf: null,
      perfil: 'ADMIN',
      status: 'ATIVO',
    } as const;

    const novoVendedor = {
      nome: 'Maria',
      cpf: '00801637180',
      telefone: '(61) 99999-0000',
      email: 'maria@x.com',
    };

    beforeEach(() => {
      mockPrisma.vendedor.findFirst.mockResolvedValue(null);
      mockPrisma.usuario.findFirst.mockResolvedValue(null);
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'dist-1',
        codigo: 1,
      });
      mockPrisma.usuario.create.mockResolvedValue({ id: 'usuario-novo' });
      mockPrisma.vendedor.create.mockResolvedValue({
        id: 'vend-novo',
        nome: 'Maria',
        codigo: 10,
      });
    });

    it('create ignora o distribuidorId do corpo e usa o do token', async () => {
      await service.create(
        { ...novoVendedor, distribuidorId: 'rede-alheia' },
        distribuidor,
      );

      const [argumentos] = mockPrisma.vendedor.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBe('dist-1');
    });

    it('create respeita o distribuidorId do corpo quando é ADMIN', async () => {
      await service.create(
        { ...novoVendedor, distribuidorId: 'dist-escolhida' },
        admin,
      );

      const [argumentos] = mockPrisma.vendedor.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBe('dist-escolhida');
    });

    it('create exige distribuidorId do ADMIN', async () => {
      await expect(service.create({ ...novoVendedor }, admin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('update não alcança vendedor de outra rede', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue(null);

      await expect(
        service.update('vend-alheio', { nome: 'X' }, distribuidor),
      ).rejects.toThrow(NotFoundException);

      // O recorte tem de estar na própria busca, não numa checagem posterior.
      const [argumentos] = mockPrisma.vendedor.findFirst.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(JSON.stringify(argumentos.where)).toContain('dist-1');
    });

    it('update descarta tentativa do distribuidor de transferir de rede', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'usuario-1',
      });
      mockPrisma.vendedor.update.mockResolvedValue({ id: 'vend-1' });

      await service.update(
        'vend-1',
        { nome: 'Maria Nova', distribuidorId: 'rede-alheia' },
        distribuidor,
      );

      const [argumentos] = mockPrisma.vendedor.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBeUndefined();
      expect(argumentos.data.nome).toBe('Maria Nova');
    });

    it('update mantém a transferência de rede para o ADMIN', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'usuario-1',
      });
      mockPrisma.vendedor.update.mockResolvedValue({ id: 'vend-1' });

      await service.update('vend-1', { distribuidorId: 'outra-rede' }, admin);

      const [argumentos] = mockPrisma.vendedor.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBe('outra-rede');
    });
    it('remove não alcança vendedor de outra rede', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue(null);

      await expect(
        service.remove('vend-alheio', distribuidor),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.vendedor.update).not.toHaveBeenCalled();
    });

    it('remove inativa o vendedor da própria rede, sem apagar o registro', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'usuario-1',
      });
      mockPrisma.vendedor.update.mockResolvedValue({ id: 'vend-1' });

      await service.remove('vend-1', distribuidor);

      const [argumentos] = mockPrisma.vendedor.update.mock.calls[0] as [
        { where: Record<string, unknown>; data: Record<string, unknown> },
      ];
      expect(argumentos.where.id).toBe('vend-1');
      expect(argumentos.data.status).toBe('INATIVO');
      expect(mockPrisma.vendedor.delete).not.toHaveBeenCalled();
    });

    it('remove escopado pela rede na própria busca', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'usuario-1',
      });
      mockPrisma.vendedor.update.mockResolvedValue({ id: 'vend-1' });

      await service.remove('vend-1', distribuidor);

      const [argumentos] = mockPrisma.vendedor.findFirst.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(JSON.stringify(argumentos.where)).toContain('dist-1');
    });
    it('remove derruba o Usuario junto, senão o login do painel segue de pé', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'usuario-1',
      });
      mockPrisma.vendedor.update.mockResolvedValue({ id: 'vend-1' });
      mockPrisma.usuario.update.mockResolvedValue({ id: 'usuario-1' });

      await service.remove('vend-1', distribuidor);

      const [usuarioArgs] = mockPrisma.usuario.update.mock.calls[0] as [
        { where: Record<string, unknown>; data: Record<string, unknown> },
      ];
      expect(usuarioArgs.where.id).toBe('usuario-1');
      expect(usuarioArgs.data.status).toBe('INATIVO');
    });

    it('update propaga o status para o Usuario, permitindo reativar', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'usuario-1',
      });
      mockPrisma.vendedor.update.mockResolvedValue({ id: 'vend-1' });
      mockPrisma.usuario.update.mockResolvedValue({ id: 'usuario-1' });

      await service.update('vend-1', { status: 'ATIVO' } as never, distribuidor);

      const [usuarioArgs] = mockPrisma.usuario.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(usuarioArgs.data.status).toBe('ATIVO');
    });
  });
});
