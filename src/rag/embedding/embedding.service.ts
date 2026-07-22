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

/**
 * Wraps Gemini's embedding model. Document chunks are embedded with the
 * RETRIEVAL_DOCUMENT task type and user questions with RETRIEVAL_QUERY,
 * which Gemini optimizes differently for indexing vs. searching.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly model: string;
  private readonly outputDimensionality: number;

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
    const results: number[][] = [];

    for (
      let offset = 0;
      offset < texts.length;
      offset += EMBEDDING_BATCH_SIZE
    ) {
      const batch = texts.slice(offset, offset + EMBEDDING_BATCH_SIZE);

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

      for (const embedding of embeddings) {
        if (!embedding.values) {
          throw new InternalServerErrorException(
            'Gemini returned an embedding with no values.',
          );
        }
        results.push(embedding.values);
      }
    }

    return results;
  }
}
