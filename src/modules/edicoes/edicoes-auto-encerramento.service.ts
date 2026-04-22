import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { StatusEdicao } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const AUTO_ENCERRAMENTO_QUEUE_NAME = 'edicoes-auto-encerramento';
const AUTO_ENCERRAMENTO_JOB_NAME = 'encerrar-edicoes-vencidas';
const AUTO_ENCERRAMENTO_REPEATABLE_JOB_ID =
  'encerrar-edicoes-vencidas-repeatable';
const AUTO_ENCERRAMENTO_INTERVAL_MS_DEFAULT = 30_000;
const AUTO_ENCERRAMENTO_BATCH_SIZE_DEFAULT = 20;

@Injectable()
export class EdicoesAutoEncerramentoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EdicoesAutoEncerramentoService.name);
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
      'EDICOES_AUTO_ENCERRAMENTO_ENABLED',
      'true',
    );
    if (enabled === 'false') {
      this.logger.warn(
        'Auto-encerramento de edições desabilitado por configuração',
      );
      return;
    }

    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL não configurada. Auto-encerramento via BullMQ não será iniciado',
      );
      return;
    }

    const intervalMs = this.getPositiveIntConfig(
      'EDICOES_AUTO_ENCERRAMENTO_INTERVAL_MS',
      AUTO_ENCERRAMENTO_INTERVAL_MS_DEFAULT,
    );

    this.queue = new Queue(AUTO_ENCERRAMENTO_QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });

    this.worker = new Worker(
      AUTO_ENCERRAMENTO_QUEUE_NAME,
      async (job: Job): Promise<void> => {
        if (job.name !== AUTO_ENCERRAMENTO_JOB_NAME) {
          return;
        }
        await this.executarAutoEncerramento();
      },
      {
        connection: { url: redisUrl },
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Falha no job ${job?.id ?? 'desconhecido'} de auto-encerramento: ${
          error.message
        }`,
      );
    });

    await this.queue.add(
      AUTO_ENCERRAMENTO_JOB_NAME,
      {},
      {
        jobId: AUTO_ENCERRAMENTO_REPEATABLE_JOB_ID,
        repeat: { every: intervalMs },
      },
    );

    // Execução inicial imediata para não aguardar o primeiro ciclo recorrente.
    await this.queue.add(
      AUTO_ENCERRAMENTO_JOB_NAME,
      {},
      {
        jobId: `${AUTO_ENCERRAMENTO_JOB_NAME}-bootstrap-${Date.now()}`,
      },
    );

    this.logger.log(
      `BullMQ inicializado para auto-encerramento (queue: ${AUTO_ENCERRAMENTO_QUEUE_NAME}, intervalo: ${intervalMs}ms)`,
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

  private async executarAutoEncerramento(): Promise<void> {
    const now = new Date();
    const batchSize = this.getPositiveIntConfig(
      'EDICOES_AUTO_ENCERRAMENTO_BATCH_SIZE',
      AUTO_ENCERRAMENTO_BATCH_SIZE_DEFAULT,
    );

    const edicoesAEncerrar = await this.prisma.edicao.findMany({
      where: {
        status: StatusEdicao.ATIVA,
        dataEncerramento: { lte: now },
      },
      select: {
        id: true,
      },
      orderBy: { dataEncerramento: 'asc' },
      take: batchSize,
    });

    if (edicoesAEncerrar.length === 0) {
      return;
    }

    const resultado = await this.prisma.edicao.updateMany({
      where: {
        id: { in: edicoesAEncerrar.map((edicao) => edicao.id) },
        status: StatusEdicao.ATIVA,
      },
      data: {
        status: StatusEdicao.ENCERRADA,
      },
    });

    if (resultado.count > 0) {
      this.logger.log(
        `Auto-encerramento executado: ${resultado.count} edição(ões) marcada(s) como ENCERRADA`,
      );
    }
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
