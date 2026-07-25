import { Injectable, Logger } from '@nestjs/common';
import { BM25Service } from './bm25.service';
import { VectorSearchService } from './vector-search.service';
import type { ScoredChunk } from './retrieval.types';

/**
 * Runs semantic vector search and BM25 keyword search, then merges them
 * into a single deduplicated candidate set. A chunk found by both methods
 * keeps both scores so RerankService can weigh them together — this is
 * what makes hybrid search more accurate than either method alone:
 * semantic search misses exact keywords/codes/names, BM25 misses
 * paraphrases and synonyms.
 */
@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    private readonly vectorSearchService: VectorSearchService,
    private readonly bm25Service: BM25Service,
  ) {}

  async search(
    question: string,
    embedding: number[],
    candidateK: number,
  ): Promise<ScoredChunk[]> {
    this.logger.log('Running vector search...');
    const vectorResults = await this.vectorSearchService.search(
      embedding,
      candidateK,
    );

    this.logger.log('Running BM25 search...');
    const bm25Results = this.bm25Service.search(question, candidateK);

    this.logger.log('Merging results...');
    this.logger.log('Removing duplicates...');
    const merged = this.merge(vectorResults, bm25Results);

    this.logger.log(
      `Merged into ${merged.length} unique candidate(s) (${vectorResults.length} vector + ${bm25Results.length} keyword).`,
    );

    return merged;
  }

  private merge(
    vectorResults: ScoredChunk[],
    bm25Results: ScoredChunk[],
  ): ScoredChunk[] {
    const merged = new Map<string, ScoredChunk>();

    for (const result of [...vectorResults, ...bm25Results]) {
      const existing = merged.get(result.id);
      if (existing) {
        existing.vectorScore = Math.max(
          existing.vectorScore,
          result.vectorScore,
        );
        existing.bm25Score = Math.max(existing.bm25Score, result.bm25Score);
      } else {
        merged.set(result.id, { ...result });
      }
    }

    return [...merged.values()];
  }
}
