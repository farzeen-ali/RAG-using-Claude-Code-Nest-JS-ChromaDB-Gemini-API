import { ChunkMetadata } from '../vector-store/vector-store.interface';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * A candidate chunk as it flows through the hybrid pipeline. Vector search
 * and BM25 search each populate one score and leave the other at 0; once
 * merged, a chunk found by both carries both. RerankService fills in
 * `rerankScore` as the final combined signal used to pick the top N.
 */
export interface ScoredChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  /** 0..1, higher = more semantically similar. 0 if not returned by vector search. */
  vectorScore: number;
  /** Raw BM25 score, unbounded, higher = stronger keyword match. 0 if not returned by BM25. */
  bm25Score: number;
  /** Set by the active IRerankProvider; absent until reranking has run. */
  rerankScore?: number;
}
