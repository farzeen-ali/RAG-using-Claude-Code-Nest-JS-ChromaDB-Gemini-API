import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import type { EmbedContentResponse } from '@google/genai';
import { AppConfig } from '../../config/configuration';
import { GEMINI_CLIENT } from '../llm/gemini-client.provider';

type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

// Keeps individual Gemini requests small and rate-limit friendly rather than
// sending every chunk of a large PDF in one call.
const EMBEDDING_BATCH_SIZE = 20;

// Bounds the in-memory embedding cache so long-running processes don't grow
// unbounded; oldest entries are evicted first (Map preserves insertion order).
const MAX_CACHE_ENTRIES = 500;

/**
 * Wraps Gemini's embedding model. Document chunks are embedded with the
 * RETRIEVAL_DOCUMENT task type and user questions with RETRIEVAL_QUERY,
 * which Gemini optimizes differently for indexing vs. searching.
 *
 * An in-memory exact-text cache avoids re-embedding identical text — e.g.
 * the same question asked twice, or the same document re-uploaded — which
 * cuts both latency and Gemini API cost without changing any calling code.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly model: string;
  private readonly outputDimensionality: number;
  private readonly cache = new Map<string, number[]>();

  constructor(
    @Inject(GEMINI_CLIENT) private readonly genAI: GoogleGenAI,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.model = this.configService.get('gemini.embeddingModel', {
      infer: true,
    });
    this.outputDimensionality = this.configService.get(
      'gemini.embeddingDimensions',
      { infer: true },
    );
  }

  async embedDocumentChunks(chunks: string[]): Promise<number[][]> {
    return this.embedBatched(chunks, 'RETRIEVAL_DOCUMENT');
  }

  async embedQuery(question: string): Promise<number[]> {
    const [embedding] = await this.embedBatched([question], 'RETRIEVAL_QUERY');
    return embedding;
  }

  private async embedBatched(
    texts: string[],
    taskType: EmbeddingTaskType,
  ): Promise<number[][]> {
    const results: (number[] | undefined)[] = texts.map((text) =>
      this.readCache(taskType, text),
    );
    const missingIndexes = results
      .map((embedding, index) => (embedding ? -1 : index))
      .filter((index) => index !== -1);

    if (missingIndexes.length < texts.length) {
      this.logger.debug(
        `Embedding cache hit for ${texts.length - missingIndexes.length}/${texts.length} text(s).`,
      );
    }

    for (
      let offset = 0;
      offset < missingIndexes.length;
      offset += EMBEDDING_BATCH_SIZE
    ) {
      const batchIndexes = missingIndexes.slice(
        offset,
        offset + EMBEDDING_BATCH_SIZE,
      );
      const batch = batchIndexes.map((index) => texts[index]);

      let response: EmbedContentResponse;
      try {
        response = await this.genAI.models.embedContent({
          model: this.model,
          contents: batch,
          config: { taskType, outputDimensionality: this.outputDimensionality },
        });
      } catch (error) {
        this.logger.error(
          'Gemini embedding request failed',
          error instanceof Error ? error.stack : String(error),
        );
        throw new InternalServerErrorException(
          'Failed to generate embeddings.',
        );
      }

      const embeddings = response.embeddings ?? [];
      if (embeddings.length !== batch.length) {
        this.logger.error(
          `Embedding count mismatch: expected ${batch.length}, got ${embeddings.length}`,
        );
        throw new InternalServerErrorException(
          'Failed to generate embeddings for one or more chunks.',
        );
      }

      batchIndexes.forEach((textIndex, i) => {
        const values = embeddings[i]?.values;
        if (!values) {
          throw new InternalServerErrorException(
            'Gemini returned an embedding with no values.',
          );
        }
        results[textIndex] = values;
        this.writeCache(taskType, texts[textIndex], values);
      });
    }

    return results as number[][];
  }

  private cacheKey(taskType: EmbeddingTaskType, text: string): string {
    return `${taskType}:${text}`;
  }

  private readCache(
    taskType: EmbeddingTaskType,
    text: string,
  ): number[] | undefined {
    return this.cache.get(this.cacheKey(taskType, text));
  }

  private writeCache(
    taskType: EmbeddingTaskType,
    text: string,
    embedding: number[],
  ): void {
    const key = this.cacheKey(taskType, text);

    if (!this.cache.has(key) && this.cache.size >= MAX_CACHE_ENTRIES) {
      const [oldestKey] = this.cache.keys();
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }

    this.cache.set(key, embedding);
  }
}
