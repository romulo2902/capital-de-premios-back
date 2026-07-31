import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RangesService, ImportacaoJob } from './ranges.service';
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
    $executeRawUnsafe: jest.fn(),
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

  describe('importação de matriz via diskStorage', () => {
    // O FileInterceptor grava em disco (não em RAM) para não estourar o
    // limite de memória do worker do PM2 em uploads grandes — ver
    // ranges.controller.ts. Isso significa que Express.Multer.File chega aqui
    // com `path` preenchido e `buffer` undefined.
    const criarCsvTemporario = (linhas: string[]): string => {
      const filePath = path.join(
        os.tmpdir(),
        `ranges-spec-${Date.now()}-${Math.random()}.csv`,
      );
      fs.writeFileSync(filePath, linhas.join('\n'));
      return filePath;
    };

    beforeEach(() => {
      mockPrisma.$executeRawUnsafe.mockReset();
      mockPrisma.$executeRawUnsafe.mockResolvedValue(null);
    });

    it('rejeita arquivo sem path (buffer não é mais aceito)', async () => {
      await expect(
        service.importarMatriz({ buffer: Buffer.from('x') } as any),
      ).rejects.toThrow('Arquivo inválido ou vazio');
    });

    it('importa um CSV lido do disco e remove o arquivo temporário ao final', async () => {
      const csvPath = criarCsvTemporario([
        '0000001;03-05-07-10-12-14-16-23-24-28-32-38-39-46-49',
        '0000002;01-02-07-10-12-17-19-21-22-26-27-30-43-44-46',
      ]);

      const { data } = await service.importarMatriz({
        path: csvPath,
        originalname: 'matriz.csv',
        mimetype: 'text/csv',
        size: fs.statSync(csvPath).size,
      } as Express.Multer.File);

      // A importação roda em background (fire-and-forget) — aguarda o job
      // concluir antes de checar o resultado.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = await service.consultarStatusImportacao();
      expect((status.data as ImportacaoJob).jobId).toBe(data.jobId);
      expect((status.data as ImportacaoJob).status).toBe('concluido');
      expect((status.data as ImportacaoJob).importados).toBe(2);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(fs.existsSync(csvPath)).toBe(false);
    });

    it('ignora linhas inválidas sem quebrar a importação', async () => {
      const csvPath = criarCsvTemporario([
        '0000010;01-02-03-04-05-06-07-08-09-10-11-12-13-14-15',
        'linha totalmente invalida',
        '0000011;02-03-04-05-06-07-08-09-10-11-12-13-14-15-16',
      ]);

      await service.importarMatriz({
        path: csvPath,
        originalname: 'matriz.csv',
        mimetype: 'text/csv',
        size: fs.statSync(csvPath).size,
      } as Express.Multer.File);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = await service.consultarStatusImportacao();
      expect((status.data as ImportacaoJob).status).toBe('concluido');
      expect((status.data as ImportacaoJob).importados).toBe(2);
    });
  });
});
