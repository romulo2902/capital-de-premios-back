import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { Perfil, StatusUsuario } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MigracaoService } from './migracao.service';

describe('MigracaoService', () => {
  let service: MigracaoService;

  const tx = {
    usuario: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  const txImportacao = {
    usuario: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    distribuidor: {
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    distribuidor: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    usuario: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigracaoService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MigracaoService>(MigracaoService);
  });

  it('deve reutilizar usuario com mesmo perfil', async () => {
    tx.usuario.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        cpf: '12345678901',
        email: 'vend@test.com',
        senhaHash: 'hash',
        perfil: Perfil.VENDEDOR,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        cpf: '12345678901',
        email: 'vend@test.com',
        senhaHash: 'hash',
        perfil: Perfil.VENDEDOR,
      });
    tx.usuario.update.mockResolvedValue({ id: 'user-1' });

    const result = await (
      service as unknown as {
        obterOuCriarUsuario: (
          txArg: typeof tx,
          payload: {
            cpf: string;
            email: string;
            perfil: Perfil;
            senhaPadrao: string;
          },
        ) => Promise<unknown>;
      }
    ).obterOuCriarUsuario(tx, {
      cpf: '12345678901',
      email: 'vend@test.com',
      perfil: Perfil.VENDEDOR,
      senhaPadrao: 'Vend@123',
    });

    expect(tx.usuario.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        cpf: '12345678901',
        email: 'vend@test.com',
        perfil: Perfil.VENDEDOR,
        deveRedefinirSenha: true,
        status: StatusUsuario.ATIVO,
      },
    });
    expect(result).toEqual({ id: 'user-1' });
  });

  it('deve criar novo usuario quando existir conflito de perfil por cpf', async () => {
    tx.usuario.findUnique
      .mockResolvedValueOnce({
        id: 'dist-user',
        cpf: '12345678901',
        email: 'dist@test.com',
        senhaHash: 'hash',
        perfil: Perfil.DISTRIBUIDOR,
      })
      .mockResolvedValueOnce(null);
    tx.usuario.create.mockImplementation(async ({ data }) => data);

    const result = await (
      service as unknown as {
        obterOuCriarUsuario: (
          txArg: typeof tx,
          payload: {
            cpf: string;
            email: string;
            perfil: Perfil;
            senhaPadrao: string;
          },
        ) => Promise<Record<string, unknown>>;
      }
    ).obterOuCriarUsuario(tx, {
      cpf: '12345678901',
      email: 'vend@test.com',
      perfil: Perfil.VENDEDOR,
      senhaPadrao: 'Vend@123',
    });

    expect(tx.usuario.create).toHaveBeenCalled();
    expect(result.cpf).toBeNull();
    expect(result.email).toBe('vend@test.com');
    expect(result.perfil).toBe(Perfil.VENDEDOR);
    expect(result.deveRedefinirSenha).toBe(true);
    expect(result.status).toBe(StatusUsuario.ATIVO);
    expect(typeof result.senhaHash).toBe('string');
    expect(await bcrypt.compare('Vend@123', result.senhaHash as string)).toBe(
      true,
    );
  });

  it('deve criar novo usuario tecnico quando existir conflito de perfil por email', async () => {
    tx.usuario.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'dist-user',
        cpf: '99999999999',
        email: 'comum@test.com',
        senhaHash: 'hash',
        perfil: Perfil.DISTRIBUIDOR,
      });
    tx.usuario.create.mockImplementation(async ({ data }) => data);

    const result = await (
      service as unknown as {
        obterOuCriarUsuario: (
          txArg: typeof tx,
          payload: {
            cpf: string;
            email: string;
            perfil: Perfil;
            senhaPadrao: string;
          },
        ) => Promise<Record<string, unknown>>;
      }
    ).obterOuCriarUsuario(tx, {
      cpf: '12345678901',
      email: 'comum@test.com',
      perfil: Perfil.VENDEDOR,
      senhaPadrao: 'Vend@123',
    });

    expect(result.cpf).toBe('12345678901');
    expect(String(result.email)).toMatch(
      /^12345678901\.vendedor\.[a-z0-9]{8}@migracao\.local$/,
    );
    expect(result.perfil).toBe(Perfil.VENDEDOR);
  });

  it('deve falhar quando cpf e email apontarem para usuarios distintos', async () => {
    tx.usuario.findUnique
      .mockResolvedValueOnce({
        id: 'user-cpf',
        cpf: '12345678901',
        email: 'cpf@test.com',
        senhaHash: 'hash',
        perfil: Perfil.DISTRIBUIDOR,
      })
      .mockResolvedValueOnce({
        id: 'user-email',
        cpf: '99999999999',
        email: 'vend@test.com',
        senhaHash: 'hash',
        perfil: Perfil.VENDEDOR,
      });

    await expect(
      (
        service as unknown as {
          obterOuCriarUsuario: (
            txArg: typeof tx,
            payload: {
              cpf: string;
              email: string;
              perfil: Perfil;
              senhaPadrao: string;
            },
          ) => Promise<unknown>;
        }
      ).obterOuCriarUsuario(tx, {
        cpf: '12345678901',
        email: 'vend@test.com',
        perfil: Perfil.DISTRIBUIDOR,
        senhaPadrao: 'Dist@123',
      }),
    ).rejects.toThrow(
      'Conflito de identidade para CPF 12345678901 e email vend@test.com: registros de usuário distintos',
    );
  });

  it('deve importar distribuidores pelo cabeçalho da planilha atual', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Distribuidor');
    worksheet.addRow([
      'Nome',
      'CPF',
      'Telefone',
      'Data Nascimento',
      'Cep',
      'Endereço',
      'Cidade',
      'Bairro',
      'Estado',
      'E-mail',
    ]);
    worksheet.addRow([
      'Milton Moyses Filho',
      '04514396192',
      '(64) 99923-7379',
      '14/9/1992',
      '75372-723',
      'Rua AR-18',
      'Goianira',
      'Residencial Araguaia',
      'GO',
      'milton@example.com',
    ]);

    mockPrisma.distribuidor.findUnique.mockResolvedValue(null);
    txImportacao.usuario.findUnique.mockResolvedValue(null);
    txImportacao.usuario.create.mockResolvedValue({ id: 'usuario-1' });
    txImportacao.distribuidor.create.mockResolvedValue({ id: 'dist-1' });
    mockPrisma.$transaction.mockImplementation(
      async (
        callback: (transaction: typeof txImportacao) => Promise<unknown>,
      ) => callback(txImportacao),
    );

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await service.importarXlsx({
      buffer,
      originalname: 'distribuidores.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.byteLength,
    });

    expect(result.data.distribuidores).toMatchObject({
      lidos: 1,
      criados: 1,
      atualizados: 0,
      ignorados: 0,
      erros: 0,
    });
    expect(result.data.erros).toEqual([]);
    const usuarioCreatePayload =
      txImportacao.usuario.create.mock.calls[0][0] as {
        data: { senhaHash: string };
      };
    expect(await bcrypt.compare('045143', usuarioCreatePayload.data.senhaHash))
      .toBe(true);
    expect(txImportacao.distribuidor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuarioId: 'usuario-1',
        nome: 'Milton Moyses Filho',
        cpf: '04514396192',
        telefone: '(64) 99923-7379',
        cep: '75372-723',
        endereco: 'Rua AR-18',
        cidade: 'Goianira',
        bairro: 'Residencial Araguaia',
        estado: 'GO',
        email: 'milton@example.com',
        status: StatusUsuario.ATIVO,
      }),
    });
  });
});
