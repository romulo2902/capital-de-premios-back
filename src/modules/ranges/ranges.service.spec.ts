import { Test, TestingModule } from '@nestjs/testing';
import { RangesService } from './ranges.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RangesService', () => {
  let service: RangesService;

  const mockPrisma = {
    matrizRange: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    edicao: {
      findUnique: jest.fn(),
    },
    $executeRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RangesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RangesService>(RangesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.matrizRange.findMany.mockResolvedValue([]);
    mockPrisma.matrizRange.count.mockResolvedValue(0);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });

  it('should expand sectors when filtering matriz by edicaoId', async () => {
    mockPrisma.edicao.findUnique.mockResolvedValue({
      id: 'edicao-1',
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      rangeInicio: BigInt(1000000),
      rangeFinal: BigInt(1100099),
      combos: [
        {
          rangeInicio: BigInt(1000000),
          rangeFinal: BigInt(1000099),
        },
      ],
    });
    mockPrisma.matrizRange.findMany.mockResolvedValue([]);
    mockPrisma.matrizRange.count.mockResolvedValue(0);

    await service.findAll({ edicaoId: 'edicao-1' });

    expect(mockPrisma.matrizRange.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              numero: {
                gte: BigInt(1000000),
                lte: BigInt(1000099),
              },
            },
          ],
        },
      }),
    );
  });
});
