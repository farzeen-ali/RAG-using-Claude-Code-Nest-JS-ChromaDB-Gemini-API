import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import type { ConversationMessage } from '../rag/retrieval/retrieval.types';
import { RedisService } from '../redis/redis.service';

const SESSION_KEY_PREFIX = 'chat:session:';

/**
 * Owns the Redis representation of a session's chat history: key naming,
 * (de)serialization, and TTL. Deliberately knows nothing about Gemini or
 * the RAG pipeline — ConversationService is the layer that combines this
 * storage with actual message generation.
 *
 * The 30-minute TTL is a sliding window, not a fixed expiry from session
 * creation: saveHistory() resets it on every turn, so an active
 * conversation never expires mid-use, while a genuinely inactive one is
 * automatically removed by Redis 30 minutes after the last message.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.ttlSeconds = this.configService.get('redis.ttlSeconds', {
      infer: true,
    });
  }

  async loadHistory(sessionId: string): Promise<ConversationMessage[]> {
    this.logger.log(`Loading Memory (session: ${sessionId})`);
    const raw = await this.redisService.get(this.key(sessionId));

    if (!raw) {
      this.logger.log('Memory Loaded (0 messages — new or expired session)');
      return [];
    }

    try {
      const messages = JSON.parse(raw) as ConversationMessage[];
      this.logger.log(`Memory Loaded (${messages.length} message(s))`);
      return messages;
    } catch {
      this.logger.warn(
        `Corrupted memory for session "${sessionId}" — starting fresh.`,
      );
      return [];
    }
  }

  async saveHistory(
    sessionId: string,
    messages: ConversationMessage[],
  ): Promise<void> {
    this.logger.log(`Saving Memory (session: ${sessionId})`);
    await this.redisService.setWithExpiry(
      this.key(sessionId),
      JSON.stringify(messages),
      this.ttlSeconds,
    );
    this.logger.log('Memory Updated');
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.redisService.del(this.key(sessionId));
    this.logger.log(`Memory Cleared (session: ${sessionId})`);
  }

  private key(sessionId: string): string {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
  }
}
