import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { StatusUsuario } from '@prisma/client';
import { PosAuthService } from './pos-auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PosAuthService', () => {
  let service: PosAuthService;

  const mockPrisma = {
    vendedor: { findUnique: jest.fn() },
    distribuidor: { findUnique: jest.fn() },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('pos-token'),
  };

  const mockConfig = {
    get: jest.fn().mockImplementation((key: string, def?: string) => {
      const map: Record<string, string> = {
        JWT_POS_SECRET: 'test-pos-secret',
        JWT_POS_EXPIRES: '180d',
      };
      return map[key] ?? def;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PosAuthService>(PosAuthService);
  });

  it('autentica vendedor por CPF e emite token POS', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vend-1',
      usuarioId: 'user-1',
      nome: 'Vendedor Um',
      cpf: '12345678900',
      status: StatusUsuario.ATIVO,
      distribuidorId: 'dist-1',
    });

    const result = await service.login({ cpf: '123.456.789-00' });

    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        perfil: 'VENDEDOR',
        origem: 'POS',
      }),
      expect.objectContaining({ secret: 'test-pos-secret', expiresIn: '180d' }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        accessToken: 'pos-token',
        perfil: 'VENDEDOR',
      }),
    );
  });

  it('autentica distribuidor quando o CPF não é de vendedor', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue(null);
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'dist-1',
      usuarioId: 'user-2',
      nome: 'Distribuidor Um',
      cpf: '98765432100',
      status: StatusUsuario.ATIVO,
    });

    const result = await service.login({ cpf: '98765432100' });

    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ perfil: 'DISTRIBUIDOR', origem: 'POS' }),
      expect.anything(),
    );
    expect((result.data as { perfil: string }).perfil).toBe('DISTRIBUIDOR');
  });

  it('rejeita CPF não vinculado a vendedor/distribuidor', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue(null);
    mockPrisma.distribuidor.findUnique.mockResolvedValue(null);

    await expect(service.login({ cpf: '00000000000' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejeita operador inativo', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue(null);
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'dist-1',
      usuarioId: 'user-2',
      nome: 'Distribuidor Um',
      cpf: '98765432100',
      status: StatusUsuario.INATIVO,
    });

    await expect(service.login({ cpf: '98765432100' })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
