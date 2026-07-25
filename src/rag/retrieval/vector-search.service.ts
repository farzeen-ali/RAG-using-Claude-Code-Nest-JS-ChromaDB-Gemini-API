import { Inject, Injectable } from '@nestjs/common';
import { VECTOR_STORE } from '../vector-store/vector-store.interface';
import type { IVectorStore } from '../vector-store/vector-store.interface';
import type { ScoredChunk } from './retrieval.types';

/**
 * Thin adapter over IVectorStore for the hybrid pipeline. Its only job is
 * converting Chroma's raw "lower is better" distance into a bounded 0..1
 * "higher is better" similarity score, so it can be merged with BM25 scores
 * on a comparable scale in HybridSearchService. Kept separate from
 * ChromaVectorStoreService so the retrieval pipeline never depends on
 * vector-store internals directly — swapping Chroma for Pinecone later
 * doesn't touch this file.
 */
@Injectable()
export class VectorSearchService {
  constructor(
    @Inject(VECTOR_STORE) private readonly vectorStore: IVectorStore,
  ) {}

  async search(embedding: number[], topK: number): Promise<ScoredChunk[]> {
    const results = await this.vectorStore.querySimilar(embedding, topK);

    return results.map((result) => ({
      id: result.metadata.chunkId,
      text: result.text,
      metadata: result.metadata,
      // Chroma distance is "lower is better" regardless of the underlying
      // metric (L2 or cosine distance); this monotonic transform turns it
      // into a bounded, higher-is-better similarity score.
      vectorScore: 1 / (1 + result.distance),
      bm25Score: 0,
    }));
  }
}
