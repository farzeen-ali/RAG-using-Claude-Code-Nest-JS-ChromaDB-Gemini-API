import { Injectable, Logger } from '@nestjs/common';
import type { IRerankProvider } from './rerank-provider.interface';
import type { ScoredChunk } from '../retrieval/retrieval.types';

// Relative importance of each ranking factor. Semantic similarity leads
// because it captures paraphrases/synonyms that keyword matching misses;
// keyword match is weighted second because exact terms (names, codes,
// figures) are exactly what semantic search tends to blur; metadata
// quality is a light tie-breaker, not a primary signal.
const WEIGHTS = { semantic: 0.5, keyword: 0.35, metadata: 0.15 };

// A chunk near this length is considered "complete" rather than a
// fragment truncated mid-thought by chunking — mirrors the configured
// CHUNK_SIZE default (see config/configuration.ts).
const IDEAL_CHUNK_LENGTH = 800;

/**
 * Default re-ranker: a zero-dependency heuristic that blends semantic
 * similarity, keyword match strength, and a metadata-quality signal into a
 * single score, then returns only the top N chunks. No external API calls,
 * no added latency or cost — good enough to ship today, and swappable for
 * a hosted cross-encoder (Cohere Rerank) later purely via DI (see
 * CohereRerankProvider for exactly how).
 */
@Injectable()
export class RerankService implements IRerankProvider {
  private readonly logger = new Logger(RerankService.name);

  rerank(
    _question: string,
    chunks: ScoredChunk[],
    topN: number,
  ): Promise<ScoredChunk[]> {
    if (chunks.length === 0) return Promise.resolve([]);

    const maxVectorScore = Math.max(
      ...chunks.map((chunk) => chunk.vectorScore),
      Number.EPSILON,
    );
    const maxBm25Score = Math.max(
      ...chunks.map((chunk) => chunk.bm25Score),
      Number.EPSILON,
    );

    const scored = chunks.map((chunk) => {
      const semanticSimilarity = chunk.vectorScore / maxVectorScore;
      const keywordMatch = chunk.bm25Score / maxBm25Score;
      const metadataQuality = this.scoreMetadataQuality(chunk);

      const rerankScore =
        WEIGHTS.semantic * semanticSimilarity +
        WEIGHTS.keyword * keywordMatch +
        WEIGHTS.metadata * metadataQuality;

      return { ...chunk, rerankScore };
    });

    const topChunks = scored
      .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
      .slice(0, topN);
    this.logger.log(
      `Reranked ${chunks.length} candidate(s), selected top ${topChunks.length}.`,
    );

    return Promise.resolve(topChunks);
  }

  /**
   * Cheap proxy for "how trustworthy is this chunk": penalizes fragments
   * that are unusually short (likely truncated mid-thought by chunking)
   * and slightly rewards chunks that carry a heading, since headed
   * sections tend to be more self-contained, complete answers.
   */
  private scoreMetadataQuality(chunk: ScoredChunk): number {
    const lengthScore = Math.min(chunk.text.length / IDEAL_CHUNK_LENGTH, 1);
    const hasHeading = /^#{1,6}\s/.test(chunk.text) ? 1 : 0.7;
    return lengthScore * hasHeading;
  }
}
