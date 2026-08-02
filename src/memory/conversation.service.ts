import { Injectable } from '@nestjs/common';
import { RetrievalPipelineService } from '../rag/retrieval/retrieval-pipeline.service';
import type {
  ConfidenceLevel,
  ConversationMessage,
} from '../rag/retrieval/retrieval.types';
import { MemoryService } from './memory.service';

export interface ConversationTurnResult {
  sessionId: string;
  answer: string;
  sources: string[];
  confidence: ConfidenceLevel;
}

/**
 * Orchestrates one turn of memory-aware chat: load history -> append user
 * message -> run the RAG pipeline with that history -> append the
 * assistant's reply -> save. This is the only service that combines
 * MemoryService (storage) with RetrievalPipelineService (generation) —
 * each of those stays independently simple and testable.
 *
 * If Redis is unreachable, MemoryService's load/save calls degrade to
 * "empty history" / "no-op" (see RedisService) rather than throwing, so a
 * Redis outage turns this into a stateless single-turn chatbot instead of
 * breaking it.
 */
@Injectable()
export class ConversationService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly retrievalPipeline: RetrievalPipelineService,
  ) {}

  async sendMessage(
    sessionId: string,
    prompt: string,
  ): Promise<ConversationTurnResult> {
    const history = await this.memoryService.loadHistory(sessionId);

    const userMessage: ConversationMessage = {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };

    const pipelineResult = await this.retrievalPipeline.runWithHistory(prompt, [
      ...history,
      userMessage,
    ]);

    const assistantMessage: ConversationMessage = {
      role: 'assistant',
      content: pipelineResult.answer,
      timestamp: new Date().toISOString(),
    };

    await this.memoryService.saveHistory(sessionId, [
      ...history,
      userMessage,
      assistantMessage,
    ]);

    return {
      sessionId,
      answer: pipelineResult.answer,
      sources: pipelineResult.sources,
      confidence: pipelineResult.confidence,
    };
  }

  async clearMemory(sessionId: string): Promise<void> {
    await this.memoryService.clearHistory(sessionId);
  }
}
