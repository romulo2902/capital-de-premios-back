import { Test, TestingModule } from '@nestjs/testing';
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
      ordenarPor: 'totalClientes',
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

  it('deve ordenar distribuidores por total de vendedores', async () => {
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
      ordenarPor: 'totalVendedores',
    });

    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({
      nome: 'Dist A',
      totalVendedores: 5,
    });
    expect(resultado[1]).toMatchObject({
      nome: 'Dist B',
      totalVendedores: 1,
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
});
