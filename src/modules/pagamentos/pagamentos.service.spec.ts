import { Test, TestingModule } from '@nestjs/testing';
import { PagamentosService } from './pagamentos.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PagamentosService', () => {
  let service: PagamentosService;

  const mockPrisma = {
    pagamento: {
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
        PagamentosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PagamentosService>(PagamentosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.pagamento.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
