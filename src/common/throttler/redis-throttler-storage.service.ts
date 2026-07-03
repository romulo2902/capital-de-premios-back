import { Injectable, Logger } from '@nestjs/common';
import {
  ThrottlerStorage,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorageService.name);
  private readonly fallbackStorage = new ThrottlerStorageService();

  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    const redis = this.redisService.client;
    if (!redis) {
      return this.fallbackStorage.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }

    const hitKey = `throttle:${throttlerName}:${key}:hits`;
    const blockKey = `throttle:${throttlerName}:${key}:block`;

    try {
      const result = (await redis.eval(
        `
          local hitKey = KEYS[1]
          local blockKey = KEYS[2]
          local ttl = tonumber(ARGV[1])
          local limit = tonumber(ARGV[2])
          local blockDuration = tonumber(ARGV[3])

          local blockTtl = redis.call('PTTL', blockKey)
          if blockTtl > 0 then
            local hits = tonumber(redis.call('GET', hitKey) or "0")
            local hitTtl = redis.call('PTTL', hitKey)
            if hitTtl < 0 then
              hitTtl = 0
            end
            return { hits, hitTtl, 1, blockTtl }
          end

          local hits = redis.call('INCR', hitKey)
          if hits == 1 then
            redis.call('PEXPIRE', hitKey, ttl)
          end

          local hitTtl = redis.call('PTTL', hitKey)
          if hitTtl < 0 then
            hitTtl = 0
          end

          if hits > limit then
            local effectiveBlockTtl = hitTtl

            if blockDuration > 0 then
              redis.call('SET', blockKey, '1', 'PX', blockDuration)
              effectiveBlockTtl = blockDuration
            end

            return { hits, hitTtl, 1, effectiveBlockTtl }
          end

          return { hits, hitTtl, 0, 0 }
        `,
        2,
        hitKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      return {
        totalHits: Number(result[0] ?? 0),
        timeToExpire: Number(result[1] ?? 0),
        isBlocked: Number(result[2] ?? 0) === 1,
        timeToBlockExpire: Number(result[3] ?? 0),
      };
    } catch (error) {
      this.logger.error(
        `Falha no throttling via Redis. Aplicando fallback em memória: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return this.fallbackStorage.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }
}
