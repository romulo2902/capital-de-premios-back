import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusMaquininha } from '@prisma/client';
import { MaquininhasService } from './maquininhas.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditosMaquininhaService } from './creditos-maquininha.service';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

describe('MaquininhasService', () => {
  let service: MaquininhasService;

  const mockPrisma = {
    maquininha: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    vendedor: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  // O cadastro credita a abertura pelo razão; aqui só interessa que foi
  // chamado com o valor certo, não o efeito no saldo.
  const mockCreditos = { creditarAbertura: jest.fn() };

  const distribuidor: RequestUser = {
    id: 'user-1',
    email: null,
    cpf: '98765432100',
    perfil: 'DISTRIBUIDOR',
    status: 'ATIVO',
    distribuidorId: 'dist-1',
  };

  const admin: RequestUser = {
    id: 'user-admin',
    email: 'admin@x.com',
    cpf: null,
    perfil: 'ADMIN',
    status: 'ATIVO',
  };

  const vendedor: RequestUser = {
    id: 'user-2',
    email: null,
    cpf: '12345678900',
    perfil: 'VENDEDOR',
    status: 'ATIVO',
    vendedorId: 'vend-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaquininhasService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CreditosMaquininhaService, useValue: mockCreditos },
      ],
    }).compile();

    service = module.get<MaquininhasService>(MaquininhasService);
  });

  describe('create', () => {
    it('normaliza a série e usa o distribuidor do token', async () => {
      mockPrisma.maquininha.findUnique.mockResolvedValue(null);
      mockPrisma.maquininha.create.mockResolvedValue({ id: 'maq-1' });
      mockPrisma.maquininha.findUniqueOrThrow.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: '80123ABC',
      });

      await service.create({ numeroSerie: '  80123abc ' }, distribuidor);

      expect(mockPrisma.maquininha.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { numeroSerie: '80123ABC' } }),
      );
      const [argumentos] = mockPrisma.maquininha.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.numeroSerie).toBe('80123ABC');
      expect(argumentos.data.distribuidorId).toBe('dist-1');
      // Nasce com o teto no máximo e saldo menor: sobra espaço de recarga.
      expect(argumentos.data.limiteCredito).toBe(5000);
      expect(mockCreditos.creditarAbertura).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({ maquininhaId: 'maq-1', valor: 2000 }),
      );
    });

    it('recusa série já cadastrada, mesmo em outra rede', async () => {
      mockPrisma.maquininha.findUnique.mockResolvedValue({ id: 'outra' });

      await expect(
        service.create({ numeroSerie: '8012345678' }, distribuidor),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.maquininha.create).not.toHaveBeenCalled();
    });

    it('recusa vínculo com vendedor de outra rede', async () => {
      mockPrisma.maquininha.findUnique.mockResolvedValue(null);
      mockPrisma.vendedor.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { numeroSerie: '8012345678', vendedorId: 'vend-alheio' },
          distribuidor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.maquininha.create).not.toHaveBeenCalled();
    });

    it('ADMIN precisa informar a rede', async () => {
      mockPrisma.maquininha.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ numeroSerie: '8012345678' }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADMIN cadastra na rede que informar', async () => {
      mockPrisma.maquininha.findUnique.mockResolvedValue(null);
      mockPrisma.maquininha.create.mockResolvedValue({ id: 'maq-1' });
      mockPrisma.maquininha.findUniqueOrThrow.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: '8012345678',
      });

      await service.create(
        { numeroSerie: '8012345678', distribuidorId: 'dist-escolhida' },
        admin,
      );

      const [argumentos] = mockPrisma.maquininha.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBe('dist-escolhida');
    });

    it('bloqueia o perfil VENDEDOR', async () => {
      await expect(
        service.create({ numeroSerie: '8012345678' }, vendedor),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.maquininha.findMany.mockResolvedValue([]);
      mockPrisma.maquininha.count.mockResolvedValue(0);
    });

    it('recorta pela rede quando o operador é DISTRIBUIDOR', async () => {
      await service.findAll({}, distribuidor);

      const [{ where }] = mockPrisma.maquininha.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(where.distribuidorId).toBe('dist-1');
    });

    it('recorta pelo vínculo quando o operador é VENDEDOR', async () => {
      await service.findAll({}, vendedor);

      const [{ where }] = mockPrisma.maquininha.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(where.distribuidorId).toBeUndefined();
      expect(where.vendedorId).toBe('vend-1');
    });

    it('ADMIN enxerga tudo, sem recorte', async () => {
      await service.findAll({}, admin);

      const [{ where }] = mockPrisma.maquininha.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(where.distribuidorId).toBeUndefined();
      expect(where.vendedorId).toBeUndefined();
    });

    it('filtro por rede só vale para ADMIN', async () => {
      await service.findAll({ distribuidorId: 'outra-rede' }, distribuidor);

      const [{ where }] = mockPrisma.maquininha.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(where.distribuidorId).toBe('dist-1');
    });
  });

  describe('update', () => {
    it('não alcança maquininha de outra rede', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue(null);

      await expect(
        service.update(
          'maq-alheia',
          { status: StatusMaquininha.INATIVA },
          distribuidor,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.maquininha.update).not.toHaveBeenCalled();
    });

    it('troca o vendedor do aparelho', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        distribuidorId: 'dist-1',
      });
      mockPrisma.vendedor.findFirst.mockResolvedValue({ id: 'vend-2' });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      await service.update('maq-1', { vendedorId: 'vend-2' }, distribuidor);

      const [argumentos] = mockPrisma.maquininha.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.vendedorId).toBe('vend-2');
    });

    it('vendedorId null devolve o aparelho ao estoque', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        distribuidorId: 'dist-1',
      });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      await service.update(
        'maq-1',
        { vendedorId: null } as never,
        distribuidor,
      );

      const [argumentos] = mockPrisma.maquininha.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.vendedorId).toBeNull();
    });

    it('campo ausente não mexe no vínculo atual', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        distribuidorId: 'dist-1',
      });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      await service.update('maq-1', { apelido: 'Balcão' }, distribuidor);

      const [argumentos] = mockPrisma.maquininha.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect('vendedorId' in argumentos.data).toBe(false);
    });

    it('distribuidor não transfere aparelho de rede', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        distribuidorId: 'dist-1',
      });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      await service.update(
        'maq-1',
        { distribuidorId: 'outra-rede' },
        distribuidor,
      );

      const [argumentos] = mockPrisma.maquininha.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBeUndefined();
    });

    it('ADMIN transfere aparelho de rede', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        distribuidorId: 'dist-1',
      });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      await service.update('maq-1', { distribuidorId: 'outra-rede' }, admin);

      const [argumentos] = mockPrisma.maquininha.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBe('outra-rede');
    });

    it('trocar de rede solta o vendedor da rede antiga', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        distribuidorId: 'dist-1',
      });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      // ADMIN transfere a rede sem informar vendedor nenhum.
      await service.update('maq-1', { distribuidorId: 'outra-rede' }, admin);

      const [argumentos] = mockPrisma.maquininha.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.distribuidorId).toBe('outra-rede');
      expect(argumentos.data.vendedorId).toBeNull();
    });

    it('vendedor informado na troca de rede sobrepõe o desvínculo', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        distribuidorId: 'dist-1',
      });
      mockPrisma.vendedor.findFirst.mockResolvedValue({ id: 'vend-da-nova' });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      await service.update(
        'maq-1',
        { distribuidorId: 'outra-rede', vendedorId: 'vend-da-nova' },
        admin,
      );

      // O vendedor precisa ser validado contra a rede NOVA, não a antiga.
      const [validacao] = mockPrisma.vendedor.findFirst.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(validacao.where.distribuidorId).toBe('outra-rede');

      const [argumentos] = mockPrisma.maquininha.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(argumentos.data.vendedorId).toBe('vend-da-nova');
    });
  });

  describe('garantirMaquininhaDoOperador', () => {
    it('exige aparelho ATIVA dentro do escopo do operador', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({ id: 'maq-1' });

      const id = await service.garantirMaquininhaDoOperador('maq-1', vendedor);

      expect(id).toBe('maq-1');
      const [{ where }] = mockPrisma.maquininha.findFirst.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(where.status).toBe(StatusMaquininha.ATIVA);
      expect(where.vendedorId).toBe('vend-1');
    });

    it('responde 404 para aparelho fora do escopo, sem vazar existência', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue(null);

      await expect(
        service.garantirMaquininhaDoOperador('maq-alheia', vendedor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validarPorNumeroSerie', () => {
    it('normaliza a série antes de buscar', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: '8012345678',
      });

      await service.validarPorNumeroSerie('  8012345678 ', vendedor);

      const [{ where }] = mockPrisma.maquininha.findFirst.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(where.numeroSerie).toBe('8012345678');
      expect(where.status).toBe(StatusMaquininha.ATIVA);
      expect(where.vendedorId).toBe('vend-1');
    });

    it('normaliza caixa e espaços internos como o cadastro faz', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({ id: 'maq-1' });

      await service.validarPorNumeroSerie('80a1 b2c3', vendedor);

      const [{ where }] = mockPrisma.maquininha.findFirst.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      // mesmo normalizarSerie do create/update: trim + upperCase, sem remover
      // espaços internos — só reflete o comportamento existente.
      expect(where.numeroSerie).toBe('80A1 B2C3');
    });

    it('retorna a maquininha encontrada, dentro do escopo do operador', async () => {
      const maquininha = { id: 'maq-1', numeroSerie: '8012345678' };
      mockPrisma.maquininha.findFirst.mockResolvedValue(maquininha);

      const resultado = await service.validarPorNumeroSerie(
        '8012345678',
        distribuidor,
      );

      expect(resultado.data).toBe(maquininha);
    });

    it('responde 404 para série fora do escopo, sem vazar existência', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue(null);

      await expect(
        service.validarPorNumeroSerie('serie-alheia', vendedor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove — exclusão lógica', () => {
    it('marca deletedAt em vez de apagar a linha', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        saldoCredito: new Prisma.Decimal(0),
      });
      mockPrisma.maquininha.update.mockResolvedValue({ id: 'maq-1' });

      const resultado = await service.remove('maq-1', admin);

      // Nunca `delete`: o razão de crédito aponta para esta linha com
      // ON DELETE RESTRICT, e apagar levaria o histórico junto.
      expect(mockPrisma.maquininha.update).toHaveBeenCalledWith({
        where: { id: 'maq-1' },
        data: { deletedAt: expect.any(Date) as unknown },
      });
      expect(resultado.message).toBe('Maquininha excluída com sucesso');
    });

    it('recusa excluir aparelho que ainda tem crédito', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue({
        id: 'maq-1',
        numeroSerie: 'POS123',
        saldoCredito: new Prisma.Decimal(250),
      });

      await expect(service.remove('maq-1', admin)).rejects.toThrow(
        /ainda tem R\$ 250\.00 de crédito/,
      );
      expect(mockPrisma.maquininha.update).not.toHaveBeenCalled();
    });

    it('responde 404 para aparelho fora do escopo do operador', async () => {
      mockPrisma.maquininha.findFirst.mockResolvedValue(null);

      await expect(service.remove('maq-alheia', admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('escopo esconde as excluídas', () => {
    it('filtra deletedAt em toda leitura, para os três perfis', async () => {
      mockPrisma.maquininha.findMany.mockResolvedValue([]);
      mockPrisma.maquininha.count.mockResolvedValue(0);

      for (const operador of [admin, distribuidor, vendedor]) {
        mockPrisma.maquininha.findMany.mockClear();
        await service.findAll({}, operador);
        const [chamada] = mockPrisma.maquininha.findMany.mock.calls[0] as [
          { where: Record<string, unknown> },
        ];
        expect(chamada.where.deletedAt).toBeNull();
      }
    });
  });
});
