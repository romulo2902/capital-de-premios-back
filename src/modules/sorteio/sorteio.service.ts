import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusEdicao } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../../common/firebase/firebase.service';
import {
  buildPaginatedResponse,
  normalizePagination,
} from '../../common/utils/pagination.util';

const SORTEIO_COLLECTION = 'sorteios';
const PREMIOS_SUBCOLLECTION = 'premios';

type SorteioListItem = Prisma.EdicaoGetPayload<{
  include: {
    resultado: true;
    premios: {
      orderBy: {
        ordem: 'asc';
      };
    };
  };
}>;

// ─── Interfaces ──────────────────────────────────────────

export interface GanhadorInfo {
  bilheteId: string;
  bilheteNumero: string;
  clienteId: string;
  clienteNome: string;
  premioId: string;
  premioDescricao: string;
}

export interface MarcarNumeroResult {
  premioId: string;
  numero: number;
  numerosMarcados: number[];
  ganhador: GanhadorInfo | null;
}

export interface EstadoPremio {
  premioId: string;
  ordem: number;
  descricao: string;
  valor: string;
  numerosMarcados: number[];
  ganhador: {
    bilheteNumero: string;
    clienteNome: string;
  } | null;
}

export interface EstadoSorteio {
  edicaoId: string;
  edicaoNumero: number;
  status: string;
  premios: EstadoPremio[];
}

// ─── Service ─────────────────────────────────────────────

@Injectable()
export class SorteioService {
  private readonly logger = new Logger(SorteioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  // ─── INICIAR SORTEIO ─────────────────────────────────

  async iniciarSorteio(
    edicaoId: string,
  ): Promise<{ message: string; data: EstadoSorteio }> {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      include: { premios: { orderBy: { ordem: 'asc' } } },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');

    if (
      edicao.status !== StatusEdicao.ENCERRADA &&
      edicao.status !== StatusEdicao.SORTEANDO
    ) {
      throw new BadRequestException(
        'A edição precisa estar ENCERRADA para iniciar o sorteio',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Atualizar status da edição
      await tx.edicao.update({
        where: { id: edicaoId },
        data: { status: StatusEdicao.SORTEANDO },
      });

      // Criar ResultadoPremio para cada prêmio (se ainda não existir)
      for (const premio of edicao.premios) {
        await tx.resultadoPremio.upsert({
          where: { premioId: premio.id },
          create: {
            premioId: premio.id,
            edicaoId,
            numerosMarcados: [],
          },
          update: {},
        });
      }
    });

    // Sincronizar com Firestore
    await this.syncStatusFirestore(
      edicaoId,
      'em_andamento',
      edicao.numero,
      edicao.premios.length,
    );

    for (const premio of edicao.premios) {
      await this.syncPremioFirestore(edicaoId, premio.id, {
        ordem: premio.ordem,
        descricao: premio.descricao,
        numerosMarcados: [],
        ultimoNumero: null,
        ganhador: null,
      });
    }

    this.logger.log(
      `Sorteio iniciado para edição ${edicaoId} (${edicao.premios.length} prêmios)`,
    );

    const estado = await this.obterEstadoSorteio(edicaoId);
    return { message: 'Sorteio iniciado', data: estado };
  }

  // ─── MARCAR NÚMERO ────────────────────────────────────

  async marcarNumero(
    edicaoId: string,
    premioId: string,
    numero: number,
  ): Promise<{ message: string; data: MarcarNumeroResult }> {
    // 1. Validar edição e prêmio
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== StatusEdicao.SORTEANDO) {
      throw new BadRequestException('Edição não está em status de sorteio');
    }

    const premio = await this.prisma.premio.findUnique({
      where: { id: premioId },
    });

    if (!premio || premio.edicaoId !== edicaoId) {
      throw new NotFoundException('Prêmio não encontrado nesta edição');
    }

    if (premio.ganhadorBilheteId) {
      throw new ConflictException('Este prêmio já possui um ganhador');
    }

    // 2. Verificar se o número já foi marcado neste prêmio
    const resultado = await this.prisma.resultadoPremio.findUnique({
      where: { premioId },
    });

    if (!resultado) {
      throw new BadRequestException('Sorteio não iniciado para este prêmio');
    }

    if (resultado.numerosMarcados.includes(numero)) {
      throw new ConflictException(
        `Número ${numero} já foi marcado neste prêmio`,
      );
    }

    // 3. Adicionar número
    const novosNumeros = [...resultado.numerosMarcados, numero];

    const resultadoAtualizado = await this.prisma.resultadoPremio.update({
      where: { premioId },
      data: { numerosMarcados: novosNumeros },
    });

    // 4. Verificar ganhadores — buscar bilhetes cujos 15 números foram todos marcados
    const ganhador = await this.verificarGanhador(
      edicaoId,
      premioId,
      novosNumeros,
      edicao.qtdNumerosCartela,
    );

    // 5. Sincronizar com Firestore
    await this.syncPremioFirestore(edicaoId, premioId, {
      ordem: premio.ordem,
      descricao: premio.descricao,
      numerosMarcados: resultadoAtualizado.numerosMarcados,
      ultimoNumero: numero,
      ganhador: ganhador
        ? {
            bilheteNumero: ganhador.bilheteNumero,
            clienteNome: ganhador.clienteNome,
          }
        : null,
    });

    this.logger.log(
      `Número ${numero} marcado no prêmio ${premio.descricao} (edição ${edicaoId})` +
        (ganhador ? ` — GANHADOR: ${ganhador.clienteNome}` : ''),
    );

    return {
      message: ganhador
        ? `Número ${numero} marcado — GANHADOR encontrado!`
        : `Número ${numero} marcado com sucesso`,
      data: {
        premioId,
        numero,
        numerosMarcados: resultadoAtualizado.numerosMarcados,
        ganhador,
      },
    };
  }

  // ─── DESMARCAR NÚMERO ─────────────────────────────────

  async desmarcarNumero(
    edicaoId: string,
    premioId: string,
    numero: number,
  ): Promise<{ message: string; data: MarcarNumeroResult }> {
    // 1. Validar edição e prêmio
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== StatusEdicao.SORTEANDO) {
      throw new BadRequestException('Edição não está em status de sorteio');
    }

    const premio = await this.prisma.premio.findUnique({
      where: { id: premioId },
    });

    if (!premio || premio.edicaoId !== edicaoId) {
      throw new NotFoundException('Prêmio não encontrado nesta edição');
    }

    // 2. Verificar se o número está marcado
    const resultado = await this.prisma.resultadoPremio.findUnique({
      where: { premioId },
    });

    if (!resultado) {
      throw new BadRequestException('Sorteio não iniciado para este prêmio');
    }

    if (!resultado.numerosMarcados.includes(numero)) {
      throw new BadRequestException(
        `Número ${numero} não está marcado neste prêmio`,
      );
    }

    // 3. Remover número
    const novosNumeros = resultado.numerosMarcados.filter(
      (n: number) => n !== numero,
    );

    const resultadoAtualizado = await this.prisma.resultadoPremio.update({
      where: { premioId },
      data: { numerosMarcados: novosNumeros },
    });

    // 4. Sincronizar com Firestore
    await this.syncPremioFirestore(edicaoId, premioId, {
      ordem: premio.ordem,
      descricao: premio.descricao,
      numerosMarcados: resultadoAtualizado.numerosMarcados,
      ultimoNumero: null,
      ganhador: null,
    });

    this.logger.log(
      `Número ${numero} desmarcado do prêmio ${premio.descricao} (edição ${edicaoId})`,
    );

    return {
      message: `Número ${numero} desmarcado com sucesso`,
      data: {
        premioId,
        numero,
        numerosMarcados: resultadoAtualizado.numerosMarcados,
        ganhador: null,
      },
    };
  }

  // ─── FINALIZAR SORTEIO ────────────────────────────────

  async finalizarSorteio(
    edicaoId: string,
  ): Promise<{ message: string; data: EstadoSorteio }> {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      include: { premios: { orderBy: { ordem: 'asc' } } },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');
    if (edicao.status !== StatusEdicao.SORTEANDO) {
      throw new BadRequestException(
        'A edição precisa estar SORTEANDO para ser finalizada',
      );
    }

    // Atualizar status
    await this.prisma.edicao.update({
      where: { id: edicaoId },
      data: { status: StatusEdicao.FINALIZADA },
    });

    // Sincronizar status no Firestore
    await this.syncStatusFirestore(
      edicaoId,
      'finalizado',
      edicao.numero,
      edicao.premios.length,
    );

    this.logger.log(`Sorteio finalizado para edição ${edicaoId}`);

    const estado = await this.obterEstadoSorteio(edicaoId);
    return { message: 'Sorteio finalizado', data: estado };
  }

  // ─── OBTER ESTADO DO SORTEIO ──────────────────────────

  async obterEstadoSorteio(edicaoId: string): Promise<EstadoSorteio> {
    const edicao = await this.prisma.edicao.findUnique({
      where: { id: edicaoId },
      include: {
        premios: {
          orderBy: { ordem: 'asc' },
          include: { resultadoPremio: true },
        },
      },
    });

    if (!edicao) throw new NotFoundException('Edição não encontrada');

    const premios: EstadoPremio[] = await Promise.all(
      edicao.premios.map(async (premio) => {
        let ganhador: EstadoPremio['ganhador'] = null;

        if (premio.ganhadorBilheteId) {
          const bilhete = await this.prisma.bilhete.findUnique({
            where: { id: premio.ganhadorBilheteId },
            include: { venda: { include: { cliente: true } } },
          });

          if (bilhete) {
            ganhador = {
              bilheteNumero: bilhete.numero.toString(),
              clienteNome: bilhete.venda.cliente.nome,
            };
          }
        }

        return {
          premioId: premio.id,
          ordem: premio.ordem,
          descricao: premio.descricao,
          valor: premio.valor.toString(),
          numerosMarcados: premio.resultadoPremio?.numerosMarcados ?? [],
          ganhador,
        };
      }),
    );

    return {
      edicaoId,
      edicaoNumero: edicao.numero,
      status: edicao.status,
      premios,
    };
  }

  // ─── LISTAR SORTEIOS ──────────────────────────────────

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{ message: string; data: unknown; meta: unknown }> {
    const pagination = normalizePagination(page, limit);
    const where = {
      status: { in: [StatusEdicao.SORTEANDO, StatusEdicao.FINALIZADA] },
    };

    const [edicoes, total] = await Promise.all([
      this.prisma.edicao.findMany({
        where,
        include: { resultado: true, premios: { orderBy: { ordem: 'asc' } } },
        orderBy: { dataSorteio: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.edicao.count({ where }),
    ]);

    return buildPaginatedResponse(
      edicoes.map((edicao) => this.serializarSorteioListItem(edicao)),
      total,
      pagination.page,
      pagination.limit,
      {
        successMessage: 'Sorteios listados com sucesso',
        emptyMessage: 'Nenhum sorteio encontrado',
      },
    );
  }

  // ─── BUSCAR SORTEIO POR ID ────────────────────────────

  async findOne(id: string): Promise<{ message: string; data: EstadoSorteio }> {
    const estado = await this.obterEstadoSorteio(id);
    return { message: 'Sorteio encontrado', data: estado };
  }

  // ─── BILHETES DO CLIENTE PARA UMA EDIÇÃO ──────────────

  async obterBilhetesCliente(
    edicaoId: string,
    clienteId: string,
  ): Promise<{
    message: string;
    data: {
      bilheteId: string;
      numero: string;
      sequenciaBolas: number[];
    }[];
  }> {
    const bilhetes = await this.prisma.bilhete.findMany({
      where: {
        venda: {
          edicaoId,
          clienteId,
          status: 'APROVADO',
        },
      },
      select: {
        id: true,
        numero: true,
        sequenciaBolas: true,
      },
      orderBy: { numero: 'asc' },
    });

    return {
      message:
        bilhetes.length > 0
          ? 'Bilhetes encontrados'
          : 'Nenhum bilhete encontrado para esta edição',
      data: bilhetes.map((b) => ({
        bilheteId: b.id,
        numero: b.numero.toString(),
        sequenciaBolas: b.sequenciaBolas,
      })),
    };
  }

  private serializarSorteioListItem(edicao: SorteioListItem) {
    return {
      ...edicao,
      valorCartela: edicao.valorCartela.toString(),
      rangeInicio: edicao.rangeInicio.toString(),
      rangeFinal: edicao.rangeFinal.toString(),
      premios: edicao.premios.map((premio) => ({
        ...premio,
        valor: premio.valor.toString(),
      })),
    };
  }

  // ─── HELPERS PRIVADOS ─────────────────────────────────

  /**
   * Verifica se algum bilhete da edição completou todos os números marcados.
   * O bilhete tem 15 números (sequenciaBolas). Se todos os 15 estão entre os
   * números marcados neste prêmio, ele é o ganhador.
   */
  private async verificarGanhador(
    edicaoId: string,
    premioId: string,
    numerosMarcados: number[],
    qtdNumerosCartela: number,
  ): Promise<GanhadorInfo | null> {
    // Só faz sentido verificar se já marcamos pelo menos a qtd de números da cartela
    if (numerosMarcados.length < qtdNumerosCartela) {
      return null;
    }

    // Buscar todos os bilhetes da edição que ainda não ganharam
    const bilhetes = await this.prisma.bilhete.findMany({
      where: {
        venda: { edicaoId, status: 'APROVADO' },
        ganhador: false,
      },
      include: {
        venda: { include: { cliente: true } },
      },
    });

    // Verificar se algum bilhete tem todos os seus números entre os marcados
    const marcadosSet = new Set(numerosMarcados);

    for (const bilhete of bilhetes) {
      const todosPresentes = bilhete.sequenciaBolas.every((n) =>
        marcadosSet.has(n),
      );

      if (todosPresentes) {
        // Registrar ganhador no banco
        await this.prisma.$transaction([
          this.prisma.bilhete.update({
            where: { id: bilhete.id },
            data: { ganhador: true, premioId },
          }),
          this.prisma.premio.update({
            where: { id: premioId },
            data: { ganhadorBilheteId: bilhete.id },
          }),
          this.prisma.resultadoPremio.update({
            where: { premioId },
            data: { ganhadorBilheteId: bilhete.id },
          }),
        ]);

        this.logger.log(
          `🏆 GANHADOR encontrado! Bilhete ${bilhete.numero} — Cliente: ${bilhete.venda.cliente.nome}`,
        );

        return {
          bilheteId: bilhete.id,
          bilheteNumero: bilhete.numero.toString(),
          clienteId: bilhete.venda.clienteId,
          clienteNome: bilhete.venda.cliente.nome,
          premioId,
          premioDescricao: '',
        };
      }
    }

    return null;
  }

  // ─── FIRESTORE SYNC ───────────────────────────────────

  private async syncStatusFirestore(
    edicaoId: string,
    estado: 'aguardando' | 'em_andamento' | 'finalizado',
    edicaoNumero: number,
    totalPremios: number,
  ): Promise<void> {
    await this.firebase.setDocument(SORTEIO_COLLECTION, edicaoId, {
      estado,
      edicaoNumero,
      totalPremios,
    });
  }

  private async syncPremioFirestore(
    edicaoId: string,
    premioId: string,
    data: {
      ordem: number;
      descricao: string;
      numerosMarcados: number[];
      ultimoNumero: number | null;
      ganhador: { bilheteNumero: string; clienteNome: string } | null;
    },
  ): Promise<void> {
    const collectionPath = `${SORTEIO_COLLECTION}/${edicaoId}/${PREMIOS_SUBCOLLECTION}`;
    await this.firebase.setDocument(collectionPath, premioId, data);
  }
}
