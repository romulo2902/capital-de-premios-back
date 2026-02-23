import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
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
    },
    cliente: {
      findUnique: jest.fn(),
      create: jest.fn(),
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

  describe('login()', () => {
    it('deve retornar tokens ao fazer login com credenciais válidas', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        id: 'cuid-1',
        email: 'admin@test.com',
        senhaHash: 'hashed',
        perfil: 'ADMIN',
        status: 'ATIVO',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({ email: 'admin@test.com', senha: 'Admin@123' });
      expect(result.data).toHaveProperty('accessToken');
      expect(result.data).toHaveProperty('refreshToken');
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
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.login({ email: 'admin@test.com', senha: 'Admin@123' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginLoja()', () => {
    it('deve criar cliente se não existir e retornar accessToken', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValue(null);
      mockPrisma.cliente.create.mockResolvedValue({ id: 'c-1', cpf: '12345678900', nome: '', telefone: '' });
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      const result = await service.loginLoja({ cpf: '123.456.789-00' });
      expect(result.data).toHaveProperty('accessToken');
      expect(mockPrisma.cliente.create).toHaveBeenCalled();
    });
  });
});
