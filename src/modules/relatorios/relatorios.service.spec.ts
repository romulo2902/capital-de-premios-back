import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  OrigemParticipacao,
  StatusCartelaSena,
  StatusVendaSena,
} from '@prisma/client';
import { RelatoriosService } from './relatorios.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RelatoriosService', () => {
  let service: RelatoriosService;

  const mockPrisma = {
    venda: {
      findMany: jest.fn(),
    },
    comissao: {
      findMany: jest.fn(),
    },
    vendedor: {
      findMany: jest.fn(),
    },
    distribuidor: {
      findMany: jest.fn(),
    },
    cliente: {
      findMany: jest.fn(),
    },
    edicao: {
      findUniqueOrThrow: jest.fn(),
    },
    bilhete: {
      findMany: jest.fn(),
    },
    edicaoSena: {
      findUniqueOrThrow: jest.fn(),
    },
    cartelaSena: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelatoriosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RelatoriosService>(RelatoriosService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should expose endpoints', async () => {
    const result = await service.findAll();
    expect(result.data).toEqual({
      endpoints: [
        '/relatorios/vendas/xlsx',
        '/relatorios/comissoes/pdf',
        '/relatorios/vendedores/xlsx',
        '/relatorios/vendedores/pdf',
        '/relatorios/distribuidores/xlsx',
        '/relatorios/distribuidores/pdf',
        '/relatorios/clientes/xlsx',
        '/relatorios/clientes/pdf',
        '/relatorios/vendas/cdp',
        '/relatorios/vendas/sena',
      ],
    });
  });

  it('deve ordenar vendedores por total de clientes', async () => {
    mockPrisma.vendedor.findMany.mockResolvedValue([
      {
        codigo: 2,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        nome: 'B vendedor',
        cpf: '12345678901',
        comissaoPercent: 3,
        telefone: '61999999999',
        dataNascimento: null,
        cep: null,
        endereco: null,
        numero: null,
        cidade: null,
        bairro: null,
        estado: null,
        email: 'b@test.com',
        distribuidor: { nome: 'Dist B' },
        _count: { clientes: 1 },
      },
      {
        codigo: 1,
        createdAt: new Date('2026-03-11T10:00:00Z'),
        nome: 'A vendedor',
        cpf: '98765432100',
        comissaoPercent: 7,
        telefone: '61888888888',
        dataNascimento: null,
        cep: null,
        endereco: null,
        numero: null,
        cidade: null,
        bairro: null,
        estado: null,
        email: 'a@test.com',
        distribuidor: { nome: 'Dist A' },
        _count: { clientes: 5 },
      },
    ]);

    const resultado = await (
      service as unknown as {
        buscarVendedoresRelatorio: (filtros: {
          ordenarPor?: string;
        }) => Promise<Array<{ nome: string; totalClientes: number }>>;
      }
    ).buscarVendedoresRelatorio({
      ordenarPor: 'cliente',
    });

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({
      nome: 'A vendedor',
      totalClientes: 5,
    });
    expect(resultado[1]).toMatchObject({
      nome: 'B vendedor',
      totalClientes: 1,
    });
  });

  it('deve ordenar vendedores por nivel e aplicar filtros do print', async () => {
    mockPrisma.vendedor.findMany.mockResolvedValue([
      {
        codigo: 10,
        createdAt: new Date('2026-03-12T10:00:00Z'),
        nome: 'Vendedor Ouro',
        cpf: '12345678901',
        comissaoPercent: 8.5,
        telefone: '61999999999',
        dataNascimento: null,
        cep: null,
        endereco: null,
        numero: null,
        cidade: null,
        bairro: null,
        estado: null,
        email: 'ouro@test.com',
        distribuidor: { nome: 'Dist 1' },
        _count: { clientes: 2 },
      },
      {
        codigo: 11,
        createdAt: new Date('2026-03-13T10:00:00Z'),
        nome: 'Vendedor Prata',
        cpf: '98765432100',
        comissaoPercent: 4,
        telefone: '61888888888',
        dataNascimento: null,
        cep: null,
        endereco: null,
        numero: null,
        cidade: null,
        bairro: null,
        estado: null,
        email: 'prata@test.com',
        distribuidor: { nome: 'Dist 2' },
        _count: { clientes: 9 },
      },
    ]);

    const resultado = await (
      service as unknown as {
        buscarVendedoresRelatorio: (filtros: {
          dataInicio?: string;
          dataFim?: string;
          distribuidor?: string;
          ordenarPor?: string;
        }) => Promise<Array<{ nome: string; nivel: number }>>;
      }
    ).buscarVendedoresRelatorio({
      dataInicio: '2026-03-01',
      dataFim: '2026-03-31',
      distribuidor: '123.456.789-00',
      ordenarPor: 'nivel',
    });

    expect(resultado[0]).toMatchObject({
      nome: 'Vendedor Ouro',
      nivel: 8.5,
    });
    expect(mockPrisma.vendedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
          distribuidor: {
            OR: [
              {
                nome: {
                  contains: '123.456.789-00',
                  mode: 'insensitive',
                },
              },
              {
                cpf: {
                  contains: '12345678900',
                },
              },
            ],
          },
        }),
      }),
    );
  });

  it('deve rejeitar data fora do padrao ISO nos filtros de relatorio', async () => {
    await expect(
      (
        service as unknown as {
          buscarVendedoresRelatorio: (filtros: {
            dataInicio?: string;
          }) => Promise<unknown>;
        }
      ).buscarVendedoresRelatorio({
        dataInicio: '01/03/2026',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deve preservar zeros a esquerda no relatorio CDP', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-09T12:00:00-03:00'));

    mockPrisma.edicao.findUniqueOrThrow.mockResolvedValue({
      id: 'edicao-1',
      numero: 'ED-126-RASCUNHO',
      dataSorteio: new Date('2026-05-27'),
      detalhes: [
        {
          rangeInicio: 980000n,
          rangeFinal: 983000n,
        },
      ],
    });
    mockPrisma.bilhete.findMany.mockResolvedValue([
      {
        numero: 980000n,
        venda: {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          gatewayPayload: { origem: 'WEB' },
          quantidade: 1,
          total: '15.00',
          cliente: {
            cpf: '6790319107',
            nome: 'Jair Rodrigues',
            telefone: '9292837492874',
            cep: '1234567',
            estado: 'GO',
            cidade: 'Goiânia',
            email: 'jair@gmail.com',
          },
        },
      },
      {
        numero: 980001n,
        venda: {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          gatewayPayload: { origem: 'WHATSAPP' },
          quantidade: 1,
          total: '15.00',
          cliente: {
            cpf: '6790319107',
            nome: 'Jair Rodrigues',
            telefone: '9292837492874',
            cep: '1234567',
            estado: 'GO',
            cidade: 'Goiânia',
            email: 'jair@gmail.com',
          },
        },
      },
      {
        numero: 980002n,
        venda: {
          origemParticipacao: OrigemParticipacao.POS,
          gatewayPayload: null,
          quantidade: 1,
          total: '15.00',
          cliente: {
            cpf: '6790319107',
            nome: 'Jair Rodrigues',
            telefone: '9292837492874',
            cep: '1234567',
            estado: 'GO',
            cidade: 'Goiânia',
            email: 'jair@gmail.com',
          },
        },
      },
    ]);

    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await service.exportarRelatorioCDP(res as never, 'edicao-1');

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; charset=utf-8',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="capital_de_premios_20260609.txt"; filename*=UTF-8\'\'capital_de_premios_20260609.txt',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Filename',
      'capital_de_premios_20260609.txt',
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('D3;0980000;15.00;06790319107;Jair Rodrigues'),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining(';002\r\nD3;0980000;'),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Adquirido pela Web;V;N;'),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Adquirido pelo WhatsApp;V;N;'),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Adquirido pelo POS;V;N;'),
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('T;3;0980000;0983000;'),
    );
  });

  it('deve exportar relatorio Sena no formato TXT esperado', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-09T12:00:00-03:00'));

    mockPrisma.edicaoSena.findUniqueOrThrow.mockResolvedValue({
      numero: '12',
      valorCartela: '5.00',
    });
    mockPrisma.cartelaSena.findMany.mockResolvedValue([
      {
        numerosEscolhidos: [2, 6, 12, 26, 48, 1],
        setimoNumero: 51,
        createdAt: new Date('2026-06-09T10:00:00Z'),
        vendaSena: {
          id: '05348c79-2df5-43c0-a6f4-93ed9cb64159',
          origemParticipacao: OrigemParticipacao.DIGITAL,
          gatewayPayload: { origem: 'WEB' },
          vendedor: { nome: 'Brunna costa' },
          cliente: {
            cpf: '9392814115',
            nome: 'Andreia Cristina Moreira',
            telefone: '+5561995094000',
            estado: 'DF',
            cep: null,
            cidade: 'Ceilândia Norte',
            endereco: 'Quadra QNO 19 Conjunto E',
            bairro: 'Ceilândia Norte',
          },
        },
      },
    ]);

    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await service.exportarRelatorioSena(
      res as never,
      'edicao-sena-1',
      '2026-06-09',
      '2026-06-09',
    );

    expect(mockPrisma.edicaoSena.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'edicao-sena-1' },
      select: { numero: true, valorCartela: true },
    });
    expect(mockPrisma.cartelaSena.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          edicaoSenaId: 'edicao-sena-1',
          vendaSena: { status: StatusVendaSena.APROVADO },
        },
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; charset=utf-8',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="capital_sena_20260609.txt"; filename*=UTF-8\'\'capital_sena_20260609.txt',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Filename',
      'capital_sena_20260609.txt',
    );
    expect(res.send).toHaveBeenCalledWith(
      [
        'H;CAPDF;09/06/2026;09/06/2026;002',
        'D3;05348c792df543c0a6f493ed9cb64159;02,06,12,26,48,01,51;5;09392814115;Andreia Cristina Moreira;;;;61;995094000;DF;;Ceilândia Norte;Quadra QNO 19 Conjunto E;Ceilândia Norte;2;Link Brunna costa;V;',
        'T;1;',
      ].join('\r\n'),
    );
  });

  it('deve ordenar distribuidores pelo filtro do print', async () => {
    mockPrisma.distribuidor.findMany.mockResolvedValue([
      {
        codigo: 2,
        createdAt: new Date('2026-03-10T10:00:00Z'),
        nome: 'Dist B',
        cpf: '12345678901',
        telefone: '61999999999',
        dataNascimento: null,
        cep: null,
        endereco: null,
        numero: null,
        cidade: null,
        bairro: null,
        estado: null,
        email: 'b@test.com',
        _count: { vendedores: 1 },
      },
      {
        codigo: 1,
        createdAt: new Date('2026-03-11T10:00:00Z'),
        nome: 'Dist A',
        cpf: '98765432100',
        telefone: '61888888888',
        dataNascimento: null,
        cep: null,
        endereco: null,
        numero: null,
        cidade: null,
        bairro: null,
        estado: null,
        email: 'a@test.com',
        _count: { vendedores: 5 },
      },
    ]);

    const resultado = await (
      service as unknown as {
        buscarDistribuidoresRelatorio: (filtros: {
          ordenarPor?: string;
        }) => Promise<Array<{ nome: string; totalVendedores: number }>>;
      }
    ).buscarDistribuidoresRelatorio({
      ordenarPor: 'distribuidores',
    });

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({
      nome: 'Dist A',
    });
    expect(resultado[1]).toMatchObject({
      nome: 'Dist B',
    });
  });

  it('deve ordenar clientes por mais recente e resolver numero aleatorio', async () => {
    mockPrisma.cliente.findMany.mockResolvedValue([
      {
        codigo: 489032,
        createdAt: new Date('2026-03-12T16:13:54Z'),
        nome: 'Cliente antigo',
        cpf: '02712810192',
        telefone: '61990018415',
        dataNascimento: null,
        cep: '72805340',
        endereco: 'Rua Josue Meireles',
        numero: 'S/N',
        cidade: 'Luziania',
        bairro: 'Centro',
        estado: 'GO',
        email: 'antigo@test.com',
        vendedor: { nome: 'Bruna costa farias' },
        vendas: [
          {
            createdAt: new Date('2026-03-12T16:13:54Z'),
            bilhetes: [{ numero: BigInt(6174) }],
          },
        ],
      },
      {
        codigo: 757052,
        createdAt: new Date('2026-03-12T16:13:38Z'),
        nome: 'Cliente recente',
        cpf: '11309549940',
        telefone: '6193986086',
        dataNascimento: null,
        cep: '72115055',
        endereco: 'Quadra CNB 5',
        numero: 'S/N',
        cidade: 'Brasilia',
        bairro: 'Taguatinga Norte',
        estado: 'DF',
        email: 'recente@test.com',
        vendedor: { nome: 'Bruna costa farias' },
        vendas: [
          {
            createdAt: new Date('2026-03-12T16:13:38Z'),
            bilhetes: [{ numero: BigInt(40707) }],
          },
        ],
      },
    ]);

    const resultado = await (
      service as unknown as {
        buscarClientesRelatorio: (filtros: {
          ordenarPor?: string;
        }) => Promise<
          Array<{ nome: string; numeroAleatorio: string; createdAt: Date }>
        >;
      }
    ).buscarClientesRelatorio({
      ordenarPor: 'maisRecente',
    });

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({
      nome: 'Cliente antigo',
      numeroAleatorio: '06174',
    });
    expect(resultado[1]).toMatchObject({
      nome: 'Cliente recente',
      numeroAleatorio: '40707',
    });
  });

  it('deve buscar pdf de clientes sem carregar vendas e bilhetes', async () => {
    mockPrisma.cliente.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-03-12T16:13:38Z'),
        nome: 'Cliente PDF',
        telefone: '6193986086',
        email: 'pdf@test.com',
        vendedor: { nome: 'Bruna costa farias' },
      },
    ]);

    const resultado = await (
      service as unknown as {
        buscarClientesRelatorioPdf: (filtros: {
          vendedor?: string;
          ordenarPor?: string;
        }) => Promise<Array<{ nome: string; vendedorNome: string }>>;
      }
    ).buscarClientesRelatorioPdf({
      vendedor: 'Bruna',
      ordenarPor: 'maisRecente',
    });

    expect(resultado).toEqual([
      {
        createdAt: new Date('2026-03-12T16:13:38Z'),
        nome: 'Cliente PDF',
        telefone: '6193986086',
        email: 'pdf@test.com',
        vendedorNome: 'Bruna costa farias',
      },
    ]);

    expect(mockPrisma.cliente.findMany).toHaveBeenCalledWith({
      where: {
        vendedor: {
          OR: [
            {
              nome: {
                contains: 'Bruna',
                mode: 'insensitive',
              },
            },
          ],
        },
      },
      select: {
        createdAt: true,
        nome: true,
        telefone: true,
        email: true,
        vendedor: {
          select: { nome: true },
        },
      },
    });
  });

  it('deve exportar relatorio de ganhadores Sena agrupado por premio', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-09T12:00:00-03:00'));

    mockPrisma.edicaoSena.findUniqueOrThrow.mockResolvedValue({
      numero: '12',
    });
    mockPrisma.cartelaSena.findMany.mockResolvedValue([
      {
        status: StatusCartelaSena.SENA_BONUS,
        vendaSena: {
          origemParticipacao: OrigemParticipacao.DIGITAL,
          gatewayPayload: null,
          cliente: {
            nome: 'Andreia Cristina Moreira',
            telefone: '+5561995094000',
            cpf: '09392814115',
            email: 'andreia@test.com',
          },
          vendedor: { nome: 'Brunna costa' },
        },
      },
      {
        status: StatusCartelaSena.QUINA,
        vendaSena: {
          origemParticipacao: OrigemParticipacao.POS,
          gatewayPayload: null,
          cliente: {
            nome: 'Jair Rodrigues',
            telefone: '+5561999999999',
            cpf: '06790319107',
            email: null,
          },
          vendedor: null,
        },
      },
    ]);

    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };

    await service.exportarRelatorioGanhadoresSena(
      res as never,
      'edicao-sena-1',
    );

    expect(mockPrisma.edicaoSena.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'edicao-sena-1' },
      select: { numero: true },
    });

    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Filename',
      'ganhadores_sena_12_20260609.txt',
    );

    const conteudo = res.send.mock.calls[0][0] as string;

    expect(conteudo).toContain('Premio: Bola Extra');
    expect(conteudo).toContain(
      'Andreia Cristina Moreira, +5561995094000, 093.928.141-15, andreia@test.com, Digital, Brunna costa',
    );
    expect(conteudo).toContain('Premio: Sena');
    expect(conteudo).toContain('Nenhum ganhador');
    expect(conteudo).toContain('Premio: Quina');
    expect(conteudo).toContain(
      'Jair Rodrigues, +5561999999999, 067.903.191-07, -, POS, -',
    );
    expect(conteudo).toContain('Premio: Quadra');
  });
});
