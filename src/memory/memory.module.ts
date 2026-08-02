import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { RedisModule } from '../redis/redis.module';
import { ConversationService } from './conversation.service';
import { MemoryService } from './memory.service';

/**
 * Short-term chat memory: combines RedisModule (storage) with RagModule's
 * RetrievalPipelineService (generation) behind ConversationService, which
 * is what ChatModule actually depends on.
 */
@Module({
  imports: [RedisModule, RagModule],
  providers: [MemoryService, ConversationService],
  exports: [ConversationService, MemoryService],
})
export class MemoryModule {}
