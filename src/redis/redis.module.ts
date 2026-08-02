import { Module } from '@nestjs/common';
import { redisClientProvider } from './redis-client.provider';
import { RedisService } from './redis.service';

/**
 * Isolates the Redis connection behind RedisService. Anything needing
 * Redis (currently just MemoryModule) imports this module and injects
 * RedisService — nothing outside this folder touches the ioredis client
 * directly.
 */
@Module({
  providers: [redisClientProvider, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
