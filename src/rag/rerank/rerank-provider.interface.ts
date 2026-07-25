import type { ScoredChunk } from '../retrieval/retrieval.types';

export const RERANK_PROVIDER = Symbol('RERANK_PROVIDER');

/**
 * Dependency-inversion boundary for re-ranking. RetrievalPipelineService
 * only depends on this interface (via the RERANK_PROVIDER token), never on
 * a concrete implementation — so the default heuristic reranker
 * (RerankService) can be replaced by a hosted cross-encoder (see
 * CohereRerankProvider) by changing a single provider registration in
 * rag.module.ts. Nothing else in the app needs to change.
 */
export interface IRerankProvider {
  rerank(
    question: string,
    chunks: ScoredChunk[],
    topN: number,
  ): Promise<ScoredChunk[]>;
}
