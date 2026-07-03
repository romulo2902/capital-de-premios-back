import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private clientInstance: Redis | null = null;
  private readonly redisUrl: string | null;

  constructor(private readonly config: ConfigService) {
    this.redisUrl = this.config.get<string>('REDIS_URL') ?? null;
  }

  get client(): Redis | null {
    if (!this.redisUrl) {
      return null;
    }

    if (!this.clientInstance) {
      this.clientInstance = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });

      this.clientInstance.on('error', (error: Error) => {
        this.logger.error(`Erro na conexão Redis: ${error.message}`);
      });
    }

    return this.clientInstance;
  }

  isConfigured(): boolean {
    return !!this.redisUrl;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.clientInstance) {
      await this.clientInstance.quit();
      this.clientInstance = null;
    }
  }
}
