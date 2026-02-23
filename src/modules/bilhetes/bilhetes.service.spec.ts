import { Test, TestingModule } from '@nestjs/testing';
import { BilhetesService } from './bilhetes.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BilhetesService', () => {
  let service: BilhetesService;

  const mockPrisma = {
    bilhete: {
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
        BilhetesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BilhetesService>(BilhetesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.bilhete.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
