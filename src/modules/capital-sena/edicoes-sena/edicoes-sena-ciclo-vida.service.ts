import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { StatusEdicaoSena } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const CICLO_VIDA_QUEUE_NAME = 'edicoes-sena-ciclo-vida';
const CICLO_VIDA_JOB_NAME = 'gerenciar-ciclo-vida-sena';
const CICLO_VIDA_REPEATABLE_JOB_ID = 'gerenciar-ciclo-vida-sena-repeatable';
const CICLO_VIDA_INTERVAL_MS_DEFAULT = 30_000;
const CICLO_VIDA_BATCH_SIZE_DEFAULT = 20;

@Injectable()
export class EdicoesSenaCicloVidaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EdicoesSenaCicloVidaService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getQueue(): Queue | null {
    return this.queue;
  }

  async onModuleInit(): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'test') {
      return;
    }

    const enabled = this.config.get<string>(
      'EDICOES_SENA_CICLO_VIDA_ENABLED',
      'true',
    );
    if (enabled === 'false') {
      this.logger.warn(
        'Ciclo de vida automático das edições Sena desabilitado por configuração',
      );
      return;
    }

    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL não configurada. Ciclo de vida automático das edições Sena via BullMQ não será iniciado',
      );
      return;
    }

    const intervalMs = this.getPositiveIntConfig(
      'EDICOES_SENA_CICLO_VIDA_INTERVAL_MS',
      CICLO_VIDA_INTERVAL_MS_DEFAULT,
    );

    this.queue = new Queue(CICLO_VIDA_QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });

    this.worker = new Worker(
      CICLO_VIDA_QUEUE_NAME,
      async (job: Job): Promise<void> => {
        if (job.name !== CICLO_VIDA_JOB_NAME) {
          return;
        }
        await this.executarCicloDeVida();
      },
      {
        connection: { url: redisUrl },
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Falha no job ${job?.id ?? 'desconhecido'} de ciclo de vida das edições Sena: ${
          error.message
        }`,
      );
    });

    await this.queue.add(
      CICLO_VIDA_JOB_NAME,
      {},
      {
        jobId: CICLO_VIDA_REPEATABLE_JOB_ID,
        repeat: { every: intervalMs },
      },
    );

    // Execução inicial imediata para não aguardar o primeiro ciclo recorrente.
    await this.queue.add(
      CICLO_VIDA_JOB_NAME,
      {},
      {
        jobId: `${CICLO_VIDA_JOB_NAME}-bootstrap-${Date.now()}`,
      },
    );

    this.logger.log(
      `BullMQ inicializado para ciclo de vida das edições Sena (queue: ${CICLO_VIDA_QUEUE_NAME}, intervalo: ${intervalMs}ms)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  private async executarCicloDeVida(): Promise<void> {
    await this.encerrarExpiradas();
    await this.ativarProximaRascunho();
  }

  private async encerrarExpiradas(): Promise<void> {
    const agora = new Date();
    const batchSize = this.getPositiveIntConfig(
      'EDICOES_SENA_CICLO_VIDA_BATCH_SIZE',
      CICLO_VIDA_BATCH_SIZE_DEFAULT,
    );

    const edicoesAEncerrar = await this.prisma.edicaoSena.findMany({
      where: {
        status: StatusEdicaoSena.ATIVA,
        dataEncerramento: { lte: agora },
      },
      select: { id: true },
      orderBy: { dataEncerramento: 'asc' },
      take: batchSize,
    });

    if (edicoesAEncerrar.length === 0) {
      return;
    }

    const resultado = await this.prisma.edicaoSena.updateMany({
      where: {
        id: { in: edicoesAEncerrar.map((edicao) => edicao.id) },
        status: StatusEdicaoSena.ATIVA,
      },
      data: { status: StatusEdicaoSena.ENCERRADA },
    });

    if (resultado.count > 0) {
      this.logger.log(
        `Auto-encerramento executado: ${resultado.count} edição(ões) Sena marcada(s) como ENCERRADA`,
      );
    }
  }

  private async ativarProximaRascunho(): Promise<void> {
    const agora = new Date();

    const existeAtiva = await this.prisma.edicaoSena.findFirst({
      where: { status: StatusEdicaoSena.ATIVA },
      select: { id: true },
    });
    if (existeAtiva) {
      return;
    }

    const proximaRascunho = await this.prisma.edicaoSena.findFirst({
      where: {
        status: StatusEdicaoSena.RASCUNHO,
        dataSorteioMegaSena: { gt: agora },
      },
      orderBy: { dataSorteioMegaSena: 'asc' },
    });
    if (!proximaRascunho) {
      return;
    }

    await this.prisma.edicaoSena.update({
      where: { id: proximaRascunho.id },
      data: { status: StatusEdicaoSena.ATIVA },
    });

    this.logger.log(
      `Edição Sena "${proximaRascunho.numero}" ativada automaticamente (RASCUNHO -> ATIVA)`,
    );
  }

  private getPositiveIntConfig(key: string, fallback: number): number {
    const rawValue = this.config.get<string | number>(key);

    if (typeof rawValue === 'number') {
      return Number.isInteger(rawValue) && rawValue > 0 ? rawValue : fallback;
    }

    if (typeof rawValue === 'string') {
      const parsed = Number.parseInt(rawValue, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    }

    return fallback;
  }
}
