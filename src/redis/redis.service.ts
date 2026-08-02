import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis-client.provider';

/**
 * Thin wrapper around the raw ioredis client. Every method swallows Redis
 * errors and logs them rather than throwing — short-term memory is a
 * best-effort enhancement, not a hard dependency, so a Redis outage should
 * degrade the chatbot to "no memory" instead of breaking it (see
 * ConversationService, which treats a failed load as an empty history and
 * a failed save as a no-op).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.warn(
        `Redis GET failed for key "${key}": ${this.describe(error)}`,
      );
      return null;
    }
  }

  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Redis SET failed for key "${key}": ${this.describe(error)}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(
        `Redis DEL failed for key "${key}": ${this.describe(error)}`,
      );
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
