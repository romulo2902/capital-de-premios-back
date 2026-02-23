import { Test, TestingModule } from '@nestjs/testing';
import { ComissoesService } from './comissoes.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ComissoesService', () => {
  let service: ComissoesService;

  const mockPrisma = {
    comissao: {
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
        ComissoesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ComissoesService>(ComissoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.comissao.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
