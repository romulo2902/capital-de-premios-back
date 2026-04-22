import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusEdicao } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import { RedisService } from '../../common/redis/redis.service';

const AUTO_ENCERRAMENTO_LOCK_KEY = 'edicoes:auto-encerramento:lock';
const AUTO_ENCERRAMENTO_INTERVAL_MS_DEFAULT = 30_000;
const AUTO_ENCERRAMENTO_BATCH_SIZE_DEFAULT = 20;

@Injectable()
export class EdicoesAutoEncerramentoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EdicoesAutoEncerramentoService.name);
  private timer: NodeJS.Timeout | null = null;
  private executando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly distributedLockService: DistributedLockService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit(): void {
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'test') {
      return;
    }

    const enabled = this.config.get<string>(
      'EDICOES_AUTO_ENCERRAMENTO_ENABLED',
      'true',
    );

    if (enabled === 'false') {
      this.logger.warn('Auto-encerramento de edições desabilitado por configuração');
      return;
    }

    const intervalMs = this.config.get<number>(
      'EDICOES_AUTO_ENCERRAMENTO_INTERVAL_MS',
      AUTO_ENCERRAMENTO_INTERVAL_MS_DEFAULT,
    );

    // Primeira execução imediata para não aguardar o primeiro intervalo.
    void this.executarCiclo();

    this.timer = setInterval(() => {
      void this.executarCiclo();
    }, intervalMs);

    this.logger.log(`Auto-encerramento de edições iniciado (intervalo: ${intervalMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async executarCiclo(): Promise<void> {
    if (this.executando) {
      return;
    }

    this.executando = true;
    const intervalMs = this.config.get<number>(
      'EDICOES_AUTO_ENCERRAMENTO_INTERVAL_MS',
      AUTO_ENCERRAMENTO_INTERVAL_MS_DEFAULT,
    );
    const lock = await this.distributedLockService.acquire(
      AUTO_ENCERRAMENTO_LOCK_KEY,
      Math.max(intervalMs * 2, 15_000),
    );
    const redisConfigurado = this.redisService.isConfigured();

    if (!lock && redisConfigurado) {
      this.executando = false;
      return;
    }

    try {
      const now = new Date();
      const batchSize = this.config.get<number>(
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
          numero: true,
          dataEncerramento: true,
        },
        orderBy: { dataEncerramento: 'asc' },
        take: batchSize,
      });

      if (edicoesAEncerrar.length === 0) {
        return;
      }

      const ids = edicoesAEncerrar.map((edicao) => edicao.id);
      const resultado = await this.prisma.edicao.updateMany({
        where: {
          id: { in: ids },
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
    } catch (error) {
      this.logger.error(
        `Falha no auto-encerramento de edições: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      if (lock) {
        await this.distributedLockService.release(lock);
      }
      this.executando = false;
    }
  }
}
