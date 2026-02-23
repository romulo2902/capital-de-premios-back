import { Test, TestingModule } from '@nestjs/testing';
import { QrcodeService } from './qrcode.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('QrcodeService', () => {
  let service: QrcodeService;

  const mockPrisma = {
    qrcode: {
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
        QrcodeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<QrcodeService>(QrcodeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.qrcode.findMany.mockResolvedValue([]);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
  });
});
