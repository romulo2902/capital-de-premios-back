import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  DestinoEdicao,
  OrigemParticipacao,
  Prisma,
  StatusEdicao,
  TipoCartela,
} from '@prisma/client';
import { EdicoesService } from './edicoes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3UploadService } from '../../common/s3/s3-upload.service';

describe('EdicoesService', () => {
  let service: EdicoesService;

  const mockPrisma = {
    $transaction: jest.fn(),
    edicao: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    edicaoDetalhe: {
      findMany: jest.fn(),
    },
  };
  const mockConfig = {
    get: jest.fn().mockReturnValue('America/Sao_Paulo'),
  };
  const mockS3UploadService = {
    uploadImage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EdicoesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: S3UploadService, useValue: mockS3UploadService },
      ],
    }).compile();

    service = module.get<EdicoesService>(EdicoesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.edicao.findMany.mockResolvedValue([]);
    mockPrisma.edicao.count.mockResolvedValue(0);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      lastPage: 0,
    });
  });

  it('create should upload imagem para o s3 quando arquivo for enviado', async () => {
    const edicao = {
      id: 'edicao-1',
      numero: 125,
      dataSorteio: new Date('2026-03-27T13:20:00.000Z'),
      dataEncerramento: new Date('2026-03-27T12:59:00.000Z'),
      valorCartela: new Prisma.Decimal('10.00'),
      rangeInicio: BigInt(1000000),
      rangeFinal: BigInt(1999999),
      qtdPremios: 1,
      destino: DestinoEdicao.SITE,
      raspadinha: false,
      frase: null,
      imagemUrl:
        'https://bucket.s3.sa-east-1.amazonaws.com/edicoes/125/capa.png',
      status: StatusEdicao.RASCUNHO,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      detalhes: [
        {
          id: 'detalhe-1',
          edicaoId: 'edicao-1',
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.UMA_CHANCE,
          rangeInicio: BigInt(1000000),
          rangeFinal: BigInt(1999999),
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      premios: [
        {
          id: 'premio-1',
          edicaoId: 'edicao-1',
          ordem: 1,
          descricao: '1º Prêmio',
          valor: new Prisma.Decimal('0'),
          ganhadorBilheteId: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
    };

    const tx = {
      edicao: {
        create: jest.fn().mockResolvedValue({ id: 'edicao-1', numero: 125 }),
        findUnique: jest.fn().mockResolvedValue(edicao),
      },
      premio: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    mockPrisma.edicao.findFirst.mockResolvedValue(null);
    mockPrisma.edicaoDetalhe.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback(tx),
    );
    mockS3UploadService.uploadImage.mockResolvedValue(edicao.imagemUrl);

    const result = await service.create(
      {
        numero: 125,
        dataSorteio: '2026-03-27T10:20',
        dataEncerramento: '2026-03-27T09:59',
        valorCartela: '10.00',
        qtdPremios: 1,
        raspadinha: false,
        detalhes: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.UMA_CHANCE,
            rangeInicio: '1000000',
            rangeFinal: '1999999',
          },
        ],
      },
      {
        buffer: Buffer.from('imagem'),
        mimetype: 'image/png',
        originalname: 'capa.png',
        size: 6,
      },
    );

    expect(mockS3UploadService.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimetype: 'image/png',
        originalname: 'capa.png',
      }),
      'edicoes/125',
    );
    expect(tx.edicao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imagemUrl: edicao.imagemUrl,
        }),
      }),
    );
    expect(result.data.imagemUrl).toBe(edicao.imagemUrl);
  });
});
