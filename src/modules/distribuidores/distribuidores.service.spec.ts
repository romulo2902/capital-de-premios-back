import { Test, TestingModule } from '@nestjs/testing';
import { DistribuidoresService } from './distribuidores.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DistribuidoresService', () => {
  let service: DistribuidoresService;

  const mockPrisma = {
    distribuidor: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistribuidoresService,
        { provide: PrismaService, useValue: mockPrisma },
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
});
