import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import { VendasService } from './vendas.service';

const VENDAS_POS_RECONCILIACAO_QUEUE_NAME = 'vendas-pos-reconciliacao';
const VENDAS_POS_RECONCILIACAO_JOB_NAME = 'reconciliar-vendas-pos-pendentes';
const VENDAS_POS_RECONCILIACAO_REPEATABLE_JOB_ID =
  'reconciliar-vendas-pos-pendentes-repeatable';
const VENDAS_POS_RECONCILIACAO_INTERVAL_MS_DEFAULT = 15_000;
const VENDAS_POS_RECONCILIACAO_BATCH_SIZE_DEFAULT = 20;
const VENDAS_POS_RECONCILIACAO_LOOKBACK_MINUTES_DEFAULT = 180;
const VENDAS_POS_RECONCILIACAO_LOCK_KEY = 'lock:vendas-pos-reconciliacao';

@Injectable()
export class VendasPosReconciliacaoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(VendasPosReconciliacaoService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly vendasService: VendasService,
    private readonly distributedLock: DistributedLockService,
  ) {}

  async onModuleInit(): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'test') {
      return;
    }

    const enabled = this.config.get<string>(
      'VENDAS_POS_RECONCILIACAO_ENABLED',
      'true',
    );
    if (enabled === 'false') {
      this.logger.warn('Reconciliação automática de vendas POS desabilitada');
      return;
    }

    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL não configurada. Reconciliação de vendas POS não será iniciada',
      );
      return;
    }

    const intervalMs = this.getPositiveIntConfig(
      'VENDAS_POS_RECONCILIACAO_INTERVAL_MS',
      VENDAS_POS_RECONCILIACAO_INTERVAL_MS_DEFAULT,
    );

    this.queue = new Queue(VENDAS_POS_RECONCILIACAO_QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });

    this.worker = new Worker(
      VENDAS_POS_RECONCILIACAO_QUEUE_NAME,
      async (job: Job): Promise<void> => {
        if (job.name !== VENDAS_POS_RECONCILIACAO_JOB_NAME) {
          return;
        }

        await this.executarReconciliacao();
      },
      {
        connection: { url: redisUrl },
        concurrency: 1,
      },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Falha no job ${job?.id ?? 'desconhecido'} de reconciliação POS: ${
          error.message
        }`,
      );
    });

    await this.queue.add(
      VENDAS_POS_RECONCILIACAO_JOB_NAME,
      {},
      {
        jobId: VENDAS_POS_RECONCILIACAO_REPEATABLE_JOB_ID,
        repeat: { every: intervalMs },
      },
    );

    await this.queue.add(
      VENDAS_POS_RECONCILIACAO_JOB_NAME,
      {},
      {
        jobId: `${VENDAS_POS_RECONCILIACAO_JOB_NAME}-bootstrap-${Date.now()}`,
      },
    );

    this.logger.log(
      `BullMQ inicializado para reconciliação POS (queue: ${VENDAS_POS_RECONCILIACAO_QUEUE_NAME}, intervalo: ${intervalMs}ms)`,
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

  private async executarReconciliacao(): Promise<void> {
    const batchSize = this.getPositiveIntConfig(
      'VENDAS_POS_RECONCILIACAO_BATCH_SIZE',
      VENDAS_POS_RECONCILIACAO_BATCH_SIZE_DEFAULT,
    );
    const lookbackMinutes = this.getPositiveIntConfig(
      'VENDAS_POS_RECONCILIACAO_LOOKBACK_MINUTES',
      VENDAS_POS_RECONCILIACAO_LOOKBACK_MINUTES_DEFAULT,
    );

    const lock = await this.distributedLock.acquire(
      VENDAS_POS_RECONCILIACAO_LOCK_KEY,
      Math.max(intervalSafeMs(batchSize), 30_000),
    );

    if (!lock) {
      return;
    }

    try {
      const confirmadas = await this.vendasService.reconciliarVendasPosPendentes(
        batchSize,
        lookbackMinutes,
      );

      if (confirmadas > 0) {
        this.logger.log(
          `Reconciliação POS executada: ${confirmadas} venda(s) confirmada(s)`,
        );
      }
    } finally {
      await this.distributedLock.release(lock);
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

function intervalSafeMs(batchSize: number): number {
  return Math.max(batchSize * 2_000, 30_000);
}
