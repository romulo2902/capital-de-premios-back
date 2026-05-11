import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, BadRequestException } from '@nestjs/common';
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
      deleteMany: jest.fn(),
    },
    premio: {
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    resultado: {
      deleteMany: jest.fn(),
    },
    resultadoPremio: {
      deleteMany: jest.fn(),
    },
    venda: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    bilhete: {
      deleteMany: jest.fn(),
    },
    comissao: {
      deleteMany: jest.fn(),
    },
    comissaoDistribuidor: {
      deleteMany: jest.fn(),
    },
    matrizRange: {
      findFirst: jest.fn().mockResolvedValue({
        sequenciaBolas: Array.from({ length: 15 }, (_, index) => index + 1),
      }),
      count: jest.fn().mockResolvedValue(1000000),
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
    mockPrisma.edicao.findFirst.mockResolvedValue(null);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      lastPage: 0,
    });
  });

  it('findAll should flag edicao atual, anteriores e proxima', async () => {
    const edicoes = [
      criarEdicaoMock({
        id: 'edicao-103',
        numero: 'ABC-2026-003',
        dataSorteio: new Date('2026-05-30T13:20:00.000Z'),
      }),
      criarEdicaoMock({
        id: 'edicao-102',
        numero: 'ABC-2026-002',
        status: StatusEdicao.ATIVA,
        dataSorteio: new Date('2026-05-27T13:20:00.000Z'),
      }),
      criarEdicaoMock({
        id: 'edicao-101',
        numero: '001',
        status: StatusEdicao.FINALIZADA,
        dataSorteio: new Date('2026-04-30T12:00:00.000Z'),
      }),
      criarEdicaoMock({
        id: 'edicao-100',
        numero: '000',
        status: StatusEdicao.ENCERRADA,
        dataSorteio: new Date('2026-04-20T12:00:00.000Z'),
      }),
    ];

    mockPrisma.edicao.findMany.mockResolvedValue(edicoes);
    mockPrisma.edicao.count.mockResolvedValue(edicoes.length);
    mockPrisma.edicao.findFirst
      .mockResolvedValueOnce({
        id: 'edicao-102',
        dataSorteio: new Date('2026-05-27T13:20:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'edicao-103',
      });

    const result = await service.findAll();

    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edicao-103',
          isAtual: false,
          isAnterior: false,
          isProxima: true,
        }),
        expect.objectContaining({
          id: 'edicao-102',
          isAtual: true,
          isAnterior: false,
          isProxima: false,
        }),
        expect.objectContaining({
          id: 'edicao-101',
          isAtual: false,
          isAnterior: true,
          isProxima: false,
        }),
        expect.objectContaining({
          id: 'edicao-100',
          isAtual: false,
          isAnterior: true,
          isProxima: false,
        }),
      ]),
    );
  });

  it('findOne should return imagemUrl saved from S3', async () => {
    const imagemUrl =
      'https://bucket.s3.sa-east-1.amazonaws.com/edicoes/125/capa.png';
    mockPrisma.edicao.findUnique.mockResolvedValue(
      criarEdicaoMock({ imagemUrl }),
    );

    const result = await service.findOne('edicao-1');

    expect(result.data.imagemUrl).toBe(imagemUrl);
  });

  it('create should upload imagem para o s3 quando arquivo for enviado', async () => {
    const edicao = {
      id: 'edicao-1',
      numero: 125,
      dataSorteio: new Date('2026-03-27T13:20:00.000Z'),
      dataEncerramento: new Date('2026-03-27T12:59:00.000Z'),
      valorCartela: new Prisma.Decimal('10.00'),
      qtdNumerosCartela: 15,
      rangeInicio: BigInt(1000000),
      rangeFinal: BigInt(1999995),
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
          tipoCartela: TipoCartela.DOZE_CHANCES,
          rangeInicio: BigInt(1000000),
          rangeFinal: BigInt(1999995),
          quantidadeSetores: 12,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      combos: [
        {
          id: 'combo-1',
          edicaoId: 'edicao-1',
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.UMA_CHANCE,
          preco: new Prisma.Decimal('10.00'),
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
          imagemUrl:
            'https://bucket.s3.sa-east-1.amazonaws.com/edicoes/125/premios/1/moto.png',
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
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      resultadoPremio: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    mockPrisma.edicao.findFirst.mockResolvedValue(null);
    mockPrisma.edicaoDetalhe.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback(tx),
    );
    mockS3UploadService.uploadImage
      .mockResolvedValueOnce(edicao.imagemUrl)
      .mockResolvedValueOnce(edicao.premios[0].imagemUrl);

    const result = await service.create(
      {
        numero: 125,
        dataSorteio: '2026-03-27T10:20',
        dataEncerramento: '2026-03-27T09:59',
        valorCartela: '10.00',
        raspadinha: false,
        detalhes: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            rangeInicio: '1000000',
            rangeFinal: '1999995',
            quantidadeSetores: 12,
          },
        ],
        combos: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.UMA_CHANCE,
            preco: '10.00',
          },
        ],
        premios: [
          {
            descricao: '1º Prêmio - Moto 0km',
            valor: '25000.00',
          },
        ],
      },

      {
        imagem: [
          {
            buffer: Buffer.from('imagem'),
            mimetype: 'image/png',
            originalname: 'capa.png',
            size: 6,
          },
        ],
        premioImagens: [
          {
            buffer: Buffer.from('premio'),
            mimetype: 'image/png',
            originalname: 'moto.png',
            size: 6,
          },
        ],
      },
    );

    expect(mockS3UploadService.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimetype: 'image/png',
        originalname: 'capa.png',
      }),
      'edicoes/125',
    );
    expect(mockS3UploadService.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimetype: 'image/png',
        originalname: 'moto.png',
      }),
      'edicoes/125/premios/1',
    );
    expect(tx.edicao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imagemUrl: edicao.imagemUrl,
          qtdNumerosCartela: 15,
          qtdPremios: 1,
        }),
      }),
    );
    expect(tx.premio.create).toHaveBeenCalledWith({
      data: {
        edicaoId: 'edicao-1',
        ordem: 1,
        descricao: '1º Prêmio - Moto 0km',
        valor: new Prisma.Decimal('25000.00'),
        imagemUrl: edicao.premios[0].imagemUrl,
      },
    });
    expect(result.data.imagemUrl).toBe(edicao.imagemUrl);
    expect(result.data.premios[0].imagemUrl).toBe(edicao.premios[0].imagemUrl);
  });

  function criarEdicaoMock(
    overrides: Partial<{
      id: string;
      numero: string;
      status: StatusEdicao;
      dataSorteio: Date;
      imagemUrl: string | null;
    }> = {},
  ) {
    return {
      id: overrides.id ?? 'edicao-1',
      numero: overrides.numero ?? '125',
      dataSorteio:
        overrides.dataSorteio ?? new Date('2026-03-27T13:20:00.000Z'),
      dataEncerramento: new Date('2026-03-27T12:59:00.000Z'),
      valorCartela: new Prisma.Decimal('10.00'),
      qtdNumerosCartela: 15,
      rangeInicio: BigInt(1000000),
      rangeFinal: BigInt(1999995),
      qtdPremios: 1,
      destino: DestinoEdicao.SITE,
      raspadinha: false,
      frase: null,
      imagemUrl: overrides.imagemUrl ?? null,
      manutencaoAtiva: false,
      manutencaoMensagem: null,
      status: overrides.status ?? StatusEdicao.RASCUNHO,
      createdAt: new Date('2026-03-20T10:00:00.000Z'),
      updatedAt: new Date('2026-03-20T10:00:00.000Z'),
      detalhes: [
        {
          id: 'detalhe-1',
          edicaoId: overrides.id ?? 'edicao-1',
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.DOZE_CHANCES,
          indiceRange: 1,
          rangeInicio: BigInt(1000000),
          rangeFinal: BigInt(1999995),
          preco: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      combos: [
        {
          id: 'combo-1',
          edicaoId: overrides.id ?? 'edicao-1',
          origemParticipacao: OrigemParticipacao.DIGITAL,
          tipoCartela: TipoCartela.UMA_CHANCE,
          preco: new Prisma.Decimal('10.00'),
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
      premios: [
        {
          id: 'premio-1',
          edicaoId: overrides.id ?? 'edicao-1',
          ordem: 1,
          descricao: '1º Prêmio',
          valor: new Prisma.Decimal('0'),
          imagemUrl: null,
          ganhadorBilheteId: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
          updatedAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
    };
  }

  it('create should reject detalhes whose derived sectors overlap', async () => {
    mockPrisma.edicao.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        numero: 126,
        dataSorteio: '2026-03-27T10:20',
        dataEncerramento: '2026-03-27T09:59',
        valorCartela: '10.00',
        raspadinha: false,
        detalhes: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            rangeInicio: '1000000',
            rangeFinal: '1000199',
            quantidadeSetores: 1,
          },
          {
            origemParticipacao: OrigemParticipacao.FISICO,
            rangeInicio: '1000150',
            rangeFinal: '1000250',
            quantidadeSetores: 1,
          },
        ],
        combos: [
          {
            origemParticipacao: OrigemParticipacao.DIGITAL,
            tipoCartela: TipoCartela.UMA_CHANCE,
            preco: '10.00',
          },
        ],
        premios: [
          {
            descricao: '1º Prêmio',
            valor: '1000.00',
          },
        ],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('remove should delete edicao in cascade when status is RASCUNHO', async () => {
    const edicao = {
      id: 'edicao-1',
      numero: 125,
      status: StatusEdicao.RASCUNHO,
      detalhes: [],
      combos: [],
      premios: [],
      createdAt: new Date(),
      dataSorteio: new Date(),
      dataEncerramento: new Date(),
      valorCartela: new Prisma.Decimal('10.00'),
      qtdNumerosCartela: 15,
      rangeInicio: BigInt(950000),
      rangeFinal: BigInt(2949999),
      qtdPremios: 1,
      destino: DestinoEdicao.SITE,
      raspadinha: false,
      frase: null,
      especie: null,
      imagemUrl: null,
      resultadosPremio: [],
      resultado: null,
      vendas: [],
    };

    const tx = {
      venda: {
        findMany: jest.fn().mockResolvedValue([{ id: 'venda-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bilhete: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      comissao: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      comissaoDistribuidor: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      resultadoPremio: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      resultado: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      premio: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      edicaoDetalhe: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      edicao: {
        delete: jest.fn().mockResolvedValue({ id: 'edicao-1' }),
      },
    };

    mockPrisma.edicao.findUnique.mockResolvedValue(edicao);
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback(tx),
    );

    const result = await service.remove('edicao-1');

    expect(result.message).toBe('Edição excluída com sucesso');
    expect(tx.venda.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { edicaoId: 'edicao-1' } }),
    );
    expect(tx.edicao.delete).toHaveBeenCalledWith({
      where: { id: 'edicao-1' },
    });
  });

  it('remove should reject when status is not RASCUNHO', async () => {
    mockPrisma.edicao.findUnique.mockResolvedValue({
      id: 'edicao-1',
      numero: 125,
      status: StatusEdicao.ATIVA,
      detalhes: [],
      combos: [],
      premios: [],
      createdAt: new Date(),
      dataSorteio: new Date(),
      dataEncerramento: new Date(),
      valorCartela: new Prisma.Decimal('10.00'),
      qtdNumerosCartela: 15,
      rangeInicio: BigInt(950000),
      rangeFinal: BigInt(2949999),
      qtdPremios: 1,
      destino: DestinoEdicao.SITE,
      raspadinha: false,
      frase: null,
      especie: null,
      imagemUrl: null,
      resultadosPremio: [],
      resultado: null,
      vendas: [],
    });

    await expect(service.remove('edicao-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
