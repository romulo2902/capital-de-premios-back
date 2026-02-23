import { Test, TestingModule } from '@nestjs/testing';
import { SaquesService } from './saques.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SaquesService', () => {
  let service: SaquesService;

  const mockPrisma = {
    saque: {
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
        SaquesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SaquesService>(SaquesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.saque.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
