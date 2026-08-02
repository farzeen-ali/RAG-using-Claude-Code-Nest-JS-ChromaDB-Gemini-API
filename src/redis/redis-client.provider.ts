import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const logger = new Logger('RedisClient');

/**
 * A single ioredis client shared by RedisService. Configured to fail fast
 * rather than hang when Redis is unreachable — maxRetriesPerRequest: 1 and
 * enableOfflineQueue: false mean a command errors out almost immediately
 * instead of queuing forever, which is what lets RedisService degrade
 * gracefully (chat keeps working without memory) instead of the whole
 * request hanging. retryStrategy keeps trying to reconnect in the
 * background so it recovers automatically once Redis comes back.
 */
export const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService<AppConfig, true>): Redis => {
    const { host, port, password } = configService.get('redis', {
      infer: true,
    });

    const client = new Redis({
      host,
      port,
      password,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (attempt: number) => Math.min(attempt * 500, 5000),
    });

    client.on('connect', () => logger.log('Redis Connected'));
    client.on('error', (error: Error) =>
      logger.error(`Redis connection error: ${error.message}`),
    );

    return client;
  },
  inject: [ConfigService],
};
