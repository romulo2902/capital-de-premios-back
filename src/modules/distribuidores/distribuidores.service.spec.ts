import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { DistribuidoresService } from './distribuidores.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QrcodeService } from '../qrcode/qrcode.service';
import { ConfigService } from '@nestjs/config';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

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

  // Responde por chave de proposito: um mock que devolve o mesmo valor para
  // qualquer variavel deixaria passar a leitura da variavel errada, que e
  // justamente o que o teste do link precisa travar.
  const mockConfig = {
    get: jest.fn((chave: string) =>
      ({
        FRONTEND_ADMIN_URL: 'http://localhost:3002',
        FRONTEND_LOJA_URL: 'http://localhost:3001',
      })[chave],
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
        callback(mockPrisma as typeof mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistribuidoresService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QrcodeService, useValue: mockQrcodeService },
        { provide: ConfigService, useValue: mockConfig },
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
    expect(
      await bcrypt.compare('033638', usuarioCreatePayload.data.senhaHash),
    ).toBe(true);
    expect(mockQrcodeService.gerarQrcodeDistribuidor).toHaveBeenCalledWith(
      'dist-1',
    );
    expect(mockQrcodeService.gerarQrcodeSenaDistribuidor).toHaveBeenCalledWith(
      'dist-1',
    );
  });

  it('create should reject cpf already present in usuario table', async () => {
    mockPrisma.distribuidor.findFirst.mockResolvedValue(null);
    mockPrisma.usuario.findFirst.mockResolvedValueOnce({
      id: 'usuario-existente',
    });

    await expect(
      service.create({
        nome: 'Tiago Lima',
        cpf: '033.638.128-09',
        telefone: '(64) 98461-4339',
        email: 'novo@email.com',
      }),
    ).rejects.toThrow(ConflictException);
  });
  describe('link público de auto-cadastro', () => {
    const distribuidor: RequestUser = {
      id: 'user-2',
      email: null,
      cpf: '98765432100',
      perfil: 'DISTRIBUIDOR',
      status: 'ATIVO',
      distribuidorId: 'dist-1',
    };

    // O id vem do token. Se o parametro da query vencesse, um distribuidor
    // leria — e rotacionaria — o link de qualquer outra rede.
    it('ignora o distribuidorId da query quando quem pede é DISTRIBUIDOR', async () => {
      mockPrisma.distribuidor.findFirst.mockResolvedValue({
        id: 'dist-1',
        nome: 'Distribuidora Norte',
        tokenCadastro: 'tok-123',
      });

      const resultado = await service.consultarLinkCadastro(
        'dist-de-outra-rede',
        distribuidor,
      );

      expect(mockPrisma.distribuidor.findFirst).toHaveBeenCalledWith({
        where: { id: 'dist-1', status: 'ATIVO' },
        select: { id: true, nome: true, tokenCadastro: true },
      });
      // O formulario mora no painel, nao na loja, e o painel roteia por hash:
      // sem o `/#/` o link abre o dashboard em vez do formulario.
      expect(resultado.data.url).toBe(
        'http://localhost:3002/#/cadastro-vendedor/tok-123',
      );
    });

    // Queimar um token vazado nao depende de a rede estar operando, entao a
    // rotacao segue valendo — o que nao pode e devolver a URL, que daria 404.
    it('regenerar em rede inativa rotaciona o token, mas sem devolver URL', async () => {
      mockPrisma.distribuidor.findUnique.mockResolvedValue({ id: 'dist-1' });
      mockPrisma.distribuidor.update.mockImplementation(
        ({ data }: { data: { tokenCadastro: string } }) =>
          Promise.resolve({
            id: 'dist-1',
            nome: 'Distribuidora Norte',
            tokenCadastro: data.tokenCadastro,
            status: 'INATIVO',
          }),
      );

      const resultado = await service.regenerarTokenCadastro(
        undefined,
        distribuidor,
      );

      expect(mockPrisma.distribuidor.update).toHaveBeenCalled();
      expect(resultado.data.token).toBeTruthy();
      expect(resultado.data.url).toBeNull();
    });

    it('não entrega link de rede inativa, que a rota pública recusaria', async () => {
      mockPrisma.distribuidor.findFirst.mockResolvedValue(null);

      await expect(
        service.consultarLinkCadastro(undefined, distribuidor),
      ).rejects.toThrow(NotFoundException);
    });

    it('regenerar grava um token diferente do anterior', async () => {
      mockPrisma.distribuidor.findUnique.mockResolvedValue({ id: 'dist-1' });
      mockPrisma.distribuidor.update.mockImplementation(
        ({ data }: { data: { tokenCadastro: string } }) =>
          Promise.resolve({
            id: 'dist-1',
            nome: 'Distribuidora Norte',
            tokenCadastro: data.tokenCadastro,
            status: 'ATIVO',
          }),
      );

      const resultado = await service.regenerarTokenCadastro(
        undefined,
        distribuidor,
      );

      const gravado = mockPrisma.distribuidor.update.mock.calls[0][0] as {
        data: { tokenCadastro: string };
      };
      expect(gravado.data.tokenCadastro).not.toBe('tok-123');
      expect(gravado.data.tokenCadastro).toHaveLength(36);
      expect(resultado.data.token).toBe(gravado.data.tokenCadastro);
    });
  });
});
