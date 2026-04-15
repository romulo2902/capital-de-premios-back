import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisService } from './redis.service';

export interface LockHandle {
  key: string;
  token: string;
}

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(private readonly redisService: RedisService) {}

  async acquire(key: string, ttlMs = 30_000): Promise<LockHandle | null> {
    const redis = this.redisService.client;
    if (!redis) {
      return null;
    }

    const token = randomUUID();
    const result = await redis.set(key, token, 'PX', ttlMs, 'NX');

    if (result !== 'OK') {
      return null;
    }

    return { key, token };
  }

  async release(lock: LockHandle): Promise<void> {
    const redis = this.redisService.client;
    if (!redis) {
      return;
    }

    try {
      await redis.eval(
        `
          if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
          end
          return 0
        `,
        1,
        lock.key,
        lock.token,
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao liberar lock distribuído (${lock.key}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
