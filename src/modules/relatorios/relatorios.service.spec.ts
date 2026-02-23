import { Test, TestingModule } from '@nestjs/testing';
import { RelatoriosService } from './relatorios.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RelatoriosService', () => {
  let service: RelatoriosService;

  const mockPrisma = {
    relatorio: {
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
        RelatoriosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RelatoriosService>(RelatoriosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.relatorio.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
