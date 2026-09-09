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
import { StatusUsuario } from '@prisma/client';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

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
      findFirst: jest.fn(),
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
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
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
    expect(
      await bcrypt.compare('033638', usuarioCreatePayload.data.senhaHash),
    ).toBe(true);
    expect(mockQrcodeService.gerarQrcodeVendedor).toHaveBeenCalledWith(
      'vend-1',
    );
    expect(mockQrcodeService.gerarQrcodeSenaVendedor).toHaveBeenCalledWith(
      'vend-1',
    );
  });

  it('create should reject cpf already present in usuario table', async () => {
    mockPrisma.vendedor.findFirst.mockResolvedValue(null);
    mockPrisma.usuario.findFirst.mockResolvedValueOnce({
      id: 'usuario-existente',
    });

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

    it('recusa comissão negativa mesmo em chamada direta ao service', async () => {
      // O DTO agora tem @Min(0), mas o clamp do service precisa valer para
      // quem não passa pelo ValidationPipe.
      await service.create(
        { ...novoVendedor, distribuidorId: 'dist-1', comissaoPercent: -50 },
        admin,
      );

      const [argumentos] = mockPrisma.vendedor.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.comissaoPercent).toBe(0);
    });

    it('mantém o teto de 100 na comissão', async () => {
      await service.create(
        { ...novoVendedor, distribuidorId: 'dist-1', comissaoPercent: 250 },
        admin,
      );

      const [argumentos] = mockPrisma.vendedor.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.comissaoPercent).toBe(100);
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

      await expect(service.remove('vend-alheio', distribuidor)).rejects.toThrow(
        NotFoundException,
      );
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

      await service.update(
        'vend-1',
        { status: 'ATIVO' } as never,
        distribuidor,
      );

      const [usuarioArgs] = mockPrisma.usuario.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(usuarioArgs.data.status).toBe('ATIVO');
    });
  });
  describe('auto-cadastro pelo link do distribuidor', () => {
    const dto = {
      nome: 'Maria da Silva',
      cpf: '008.016.371-80',
      telefone: '(61) 99233-9525',
      email: 'MARIA@Exemplo.com ',
    };

    beforeEach(() => {
      mockPrisma.distribuidor.findFirst.mockResolvedValue({
        id: 'dist-1',
        nome: 'Distribuidora Norte',
      });
      mockPrisma.vendedor.findFirst.mockResolvedValue(null);
      mockPrisma.usuario.findFirst.mockResolvedValue(null);
      mockPrisma.usuario.create.mockResolvedValue({ id: 'user-novo' });
      mockPrisma.vendedor.create.mockResolvedValue({
        id: 'vend-novo',
        codigo: 51,
        nome: dto.nome,
        status: 'INATIVO',
        aprovadoEm: null,
      });
    });

    // Token invalido e distribuidor inativo tem que responder igual. Se so o
    // token invalido desse 404, varrer a rota diria quais redes existem.
    it('recusa token inválido com 404', async () => {
      mockPrisma.distribuidor.findFirst.mockResolvedValue(null);

      await expect(
        service.autoCadastrar('token-que-nao-existe', dto),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockPrisma.vendedor.create).not.toHaveBeenCalled();
    });

    it('só encontra a rede por token de distribuidor ativo', async () => {
      await service.buscarRedePorTokenDeCadastro('tok-123');

      expect(mockPrisma.distribuidor.findFirst).toHaveBeenCalledWith({
        where: { tokenCadastro: 'tok-123', status: StatusUsuario.ATIVO },
        select: { id: true, nome: true },
      });
    });

    // A rede sai do token da URL. Se saisse do corpo, quem tem um link
    // valido cadastraria vendedor em qualquer rede.
    it('vincula à rede do token, com vendedor e usuário INATIVOS', async () => {
      await service.autoCadastrar('tok-123', dto);

      const usuario = mockPrisma.usuario.create.mock.calls[0][0] as {
        data: { status: string; cpf: string; email: string };
      };
      const vendedor = mockPrisma.vendedor.create.mock.calls[0][0] as {
        data: { distribuidorId: string; status: string; aprovadoEm: null };
      };

      expect(usuario.data.status).toBe(StatusUsuario.INATIVO);
      expect(usuario.data.cpf).toBe('00801637180');
      expect(usuario.data.email).toBe('maria@exemplo.com');
      expect(vendedor.data.distribuidorId).toBe('dist-1');
      expect(vendedor.data.status).toBe(StatusUsuario.INATIVO);
      expect(vendedor.data.aprovadoEm).toBeNull();
    });

    it('recusa CPF já cadastrado antes de criar qualquer coisa', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({ id: 'ja-existe' });

      await expect(
        service.autoCadastrar('tok-123', dto),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockPrisma.usuario.create).not.toHaveBeenCalled();
      expect(mockPrisma.vendedor.create).not.toHaveBeenCalled();
    });
  });

  describe('aprovação do auto-cadastro', () => {
    const distribuidor: RequestUser = {
      id: 'user-2',
      email: null,
      cpf: '98765432100',
      perfil: 'DISTRIBUIDOR',
      status: 'ATIVO',
      distribuidorId: 'dist-1',
    };

    it('liga vendedor e usuário na mesma transação', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'user-9',
        nome: 'Maria',
        aprovadoEm: null,
      });
      mockPrisma.vendedor.update.mockResolvedValue({
        id: 'vend-1',
        codigo: 51,
        status: 'ATIVO',
      });

      await service.aprovar('vend-1', distribuidor);

      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        data: { status: StatusUsuario.ATIVO },
      });

      const update = mockPrisma.vendedor.update.mock.calls[0][0] as {
        data: { status: string; aprovadoEm: Date };
      };
      expect(update.data.status).toBe(StatusUsuario.ATIVO);
      expect(update.data.aprovadoEm).toBeInstanceOf(Date);
    });

    // Vendedor de outra rede responde 404, nunca 403: 403 confirmaria que o
    // id existe em alguma rede.
    it('não alcança vendedor de outra rede', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue(null);

      await expect(
        service.aprovar('vend-de-outro', distribuidor),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockPrisma.usuario.update).not.toHaveBeenCalled();
    });

    it('recusa aprovar duas vezes', async () => {
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        usuarioId: 'user-9',
        nome: 'Maria',
        aprovadoEm: new Date('2026-09-01T10:00:00Z'),
      });

      await expect(
        service.aprovar('vend-1', distribuidor),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockPrisma.vendedor.update).not.toHaveBeenCalled();
    });
  });
});
