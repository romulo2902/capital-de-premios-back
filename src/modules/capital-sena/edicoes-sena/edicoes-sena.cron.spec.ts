import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StatusEdicaoSena } from '@prisma/client';
import { EdicoesSenaCronService } from './edicoes-sena.cron';
import { PrismaService } from '../../../prisma/prisma.service';

describe('EdicoesSenaCronService', () => {
  let service: EdicoesSenaCronService;

  const mockPrisma = {
    edicaoSena: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfig = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EdicoesSenaCronService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EdicoesSenaCronService>(EdicoesSenaCronService);
  });

  describe('gerenciarCicloDeVida', () => {
    it('não executa quando NODE_APP_INSTANCE indica outra instância do cluster', async () => {
      mockConfig.get.mockReturnValue('1');

      await service.gerenciarCicloDeVida();

      expect(mockPrisma.edicaoSena.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.edicaoSena.findFirst).not.toHaveBeenCalled();
    });

    it('encerra edições ATIVAS com dataEncerramento expirada', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.edicaoSena.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.edicaoSena.findFirst.mockResolvedValue({ id: 'edicao-ativa' });

      await service.gerenciarCicloDeVida();

      expect(mockPrisma.edicaoSena.updateMany).toHaveBeenCalledWith({
        where: {
          status: StatusEdicaoSena.ATIVA,
          dataEncerramento: { lt: expect.any(Date) },
        },
        data: { status: StatusEdicaoSena.ENCERRADA },
      });
    });

    it('não ativa novo rascunho quando já existe edição ATIVA', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.edicaoSena.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.edicaoSena.findFirst.mockResolvedValue({ id: 'edicao-ativa' });

      await service.gerenciarCicloDeVida();

      expect(mockPrisma.edicaoSena.update).not.toHaveBeenCalled();
    });

    it('ativa a próxima edição em RASCUNHO cuja data de sorteio ainda não passou', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.edicaoSena.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.edicaoSena.findFirst
        .mockResolvedValueOnce(null) // nenhuma ATIVA
        .mockResolvedValueOnce({ id: 'edicao-rascunho', numero: '001' });

      await service.gerenciarCicloDeVida();

      expect(mockPrisma.edicaoSena.findFirst).toHaveBeenLastCalledWith({
        where: {
          status: StatusEdicaoSena.RASCUNHO,
          dataSorteioMegaSena: { gt: expect.any(Date) },
        },
        orderBy: { dataSorteioMegaSena: 'asc' },
      });
      expect(mockPrisma.edicaoSena.update).toHaveBeenCalledWith({
        where: { id: 'edicao-rascunho' },
        data: { status: StatusEdicaoSena.ATIVA },
      });
    });

    it('não ativa nada quando não há rascunho elegível', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockPrisma.edicaoSena.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.edicaoSena.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.gerenciarCicloDeVida();

      expect(mockPrisma.edicaoSena.update).not.toHaveBeenCalled();
    });
  });
});
