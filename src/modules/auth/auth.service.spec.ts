import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    usuario: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cliente: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    distribuidor: {
      findFirst: jest.fn(),
    },
    vendedor: {
      findFirst: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  };

  const mockConfig = {
    get: jest.fn().mockImplementation((key: string, def?: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_ACCESS_EXPIRES: '15m',
        JWT_REFRESH_EXPIRES: '7d',
      };
      return map[key] ?? def;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── POST /auth/login — Painel Admin ────────────────────────────

  describe('login() — painel admin', () => {
    it('deve retornar tokens para ADMIN com credenciais válidas', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-1',
        email: 'admin@test.com',
        senhaHash: 'hashed',
        perfil: 'ADMIN',
        status: 'ATIVO',
        deveRedefinirSenha: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: 'admin@test.com', senha: 'Admin@123' });
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('refreshToken');
      expect(result.data).toHaveProperty('perfil', 'ADMIN');
    });

    it('deve retornar tokens para DISTRIBUIDOR com credenciais válidas', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-2',
        email: 'dist@test.com',
        senhaHash: 'hashed',
        perfil: 'DISTRIBUIDOR',
        status: 'ATIVO',
        deveRedefinirSenha: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.distribuidor.findFirst.mockResolvedValue({
        id: 'dist-1',
        nome: 'Distribuidor Teste',
        usuarioId: 'cuid-2',
      });

      const result = await service.login({ email: 'dist@test.com', senha: 'Dist@123' });
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('perfil', 'DISTRIBUIDOR');
      expect(result.data).toHaveProperty('distribuidor');
    });

    it('deve retornar tokens para VENDEDOR com credenciais válidas', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-3',
        email: 'vend@test.com',
        senhaHash: 'hashed',
        perfil: 'VENDEDOR',
        status: 'ATIVO',
        deveRedefinirSenha: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.vendedor.findFirst.mockResolvedValue({
        id: 'vend-1',
        nome: 'Vendedor Teste',
        usuarioId: 'cuid-3',
      });

      const result = await service.login({ email: 'vend@test.com', senha: 'Vend@123' });
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('perfil', 'VENDEDOR');
      expect(result.data).toHaveProperty('vendedor');
    });

    it('deve lançar UnauthorizedException para credenciais inválidas', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'nao@existe.com', senha: '123' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException para senha incorreta', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-1',
        email: 'admin@test.com',
        senhaHash: 'hashed',
        perfil: 'ADMIN',
        status: 'ATIVO',
        deveRedefinirSenha: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login({ email: 'admin@test.com', senha: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException para usuário INATIVO', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-1',
        email: 'admin@test.com',
        senhaHash: 'hashed',
        perfil: 'ADMIN',
        status: 'INATIVO',
        deveRedefinirSenha: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login({ email: 'admin@test.com', senha: 'Admin@123' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar ForbiddenException para deveRedefinirSenha=true', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-1',
        email: 'admin@test.com',
        senhaHash: 'hashed',
        perfil: 'ADMIN',
        status: 'ATIVO',
        deveRedefinirSenha: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login({ email: 'admin@test.com', senha: 'Admin@123' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar UnauthorizedException para perfil CLIENTE tentando logar no admin', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-4',
        email: 'cliente@test.com',
        senhaHash: 'hashed',
        perfil: 'CLIENTE',
        status: 'ATIVO',
        deveRedefinirSenha: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login({ email: 'cliente@test.com', senha: '123' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── POST /auth/loja — Painel Cliente ──────────────────────────

  describe('loginLoja() — painel cliente', () => {
    it('deve criar cliente se não existir e retornar accessToken', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);
      mockPrisma.cliente.create.mockResolvedValue({
        id: 'c-1',
        cpf: '12345678900',
        nome: '',
        telefone: '',
      });

      const result = await service.loginLoja({
        cpf: '123.456.789-00',
        nome: 'Cliente Teste',
        telefone: '(11) 99999-9999',
        dataNascimento: '1990-01-15',
      });
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('perfil', 'CLIENTE');
      expect(mockPrisma.cliente.create).toHaveBeenCalled();
    });

    it('deve exigir data de nascimento no primeiro acesso', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);

      await expect(
        service.loginLoja({
          cpf: '123.456.789-00',
          nome: 'Cliente Teste',
          telefone: '(11) 99999-9999',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve retornar token para cliente já existente', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue({
        id: 'c-2',
        cpf: '98765432100',
        nome: 'Fulano',
        telefone: '11999999999',
        dataNascimento: new Date('1990-01-15T00:00:00.000Z'),
      });

      const result = await service.loginLoja({ cpf: '987.654.321-00' });
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('perfil', 'CLIENTE');
      expect(mockPrisma.cliente.create).not.toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedException quando CPF não for informado', async () => {
      await expect(service.loginLoja({})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('redefinirSenhaPorAdmin()', () => {
    it('deve redefinir senha de vendedor/distribuidor com sucesso', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'vendedor@test.com',
        perfil: 'VENDEDOR',
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-new-password');
      mockPrisma.usuario.update.mockResolvedValue({
        id: 'user-1',
      });

      const result = await service.redefinirSenhaPorAdmin({
        usuarioId: 'user-1',
        novaSenha: 'NovaSenha@123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('NovaSenha@123', 10);
      expect(mockPrisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          senhaHash: 'hashed-new-password',
          deveRedefinirSenha: false,
        },
      });
      expect(result).toEqual({ message: 'Senha redefinida com sucesso' });
    });

    it('deve lançar NotFoundException quando usuário não existir', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.redefinirSenhaPorAdmin({
          usuarioId: 'user-inexistente',
          novaSenha: 'NovaSenha@123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException para perfil não permitido', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'user-admin',
        email: 'admin@test.com',
        perfil: 'ADMIN',
      });

      await expect(
        service.redefinirSenhaPorAdmin({
          usuarioId: 'user-admin',
          novaSenha: 'NovaSenha@123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
