import { Test, TestingModule } from '@nestjs/testing';
import { MigracaoService } from './migracao.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MigracaoService', () => {
  let service: MigracaoService;

  const mockPrisma = {
    migracao: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigracaoService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MigracaoService>(MigracaoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.migracao.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
