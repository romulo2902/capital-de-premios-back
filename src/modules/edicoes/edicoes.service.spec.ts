import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EdicoesService } from './edicoes.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EdicoesService', () => {
  let service: EdicoesService;

  const mockPrisma = {
    edicao: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const mockConfig = {
    get: jest.fn().mockReturnValue('America/Sao_Paulo'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EdicoesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EdicoesService>(EdicoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.edicao.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
