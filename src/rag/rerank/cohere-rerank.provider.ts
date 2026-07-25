import { Injectable, NotImplementedException } from '@nestjs/common';
import type { IRerankProvider } from './rerank-provider.interface';
import type { ScoredChunk } from '../retrieval/retrieval.types';

/**
 * ============================================================================
 * FUTURE INTEGRATION POINT — Cohere Rerank API
 * ============================================================================
 * This class demonstrates how a hosted cross-encoder reranker
 * (https://docs.cohere.com/docs/rerank) can replace the local heuristic
 * RerankService with ZERO changes anywhere else in the app, thanks to the
 * IRerankProvider interface + RERANK_PROVIDER DI token in rag.module.ts.
 *
 * It intentionally does NOT require a COHERE_API_KEY to boot the app — it
 * is not registered as the active provider by default (see rag.module.ts),
 * so it costs nothing and changes no behavior until a future lesson wires
 * it in.
 *
 * To activate it in a future lesson:
 *   1. npm install cohere-ai
 *   2. Add COHERE_API_KEY to configuration.ts / env.validation.ts / .env
 *   3. Implement rerank() below, e.g.:
 *
 *        const cohere = new CohereClient({ token: this.apiKey });
 *        const response = await cohere.rerank({
 *          query: question,
 *          documents: chunks.map((chunk) => chunk.text),
 *          topN,
 *          model: 'rerank-english-v3.0',
 *        });
 *        return response.results.map((result) => ({
 *          ...chunks[result.index],
 *          rerankScore: result.relevanceScore,
 *        }));
 *
 *   4. In rag.module.ts, change ONE line:
 *        { provide: RERANK_PROVIDER, useClass: CohereRerankProvider }
 * ============================================================================
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- signature must match IRerankProvider; this is an unimplemented stub */
@Injectable()
export class CohereRerankProvider implements IRerankProvider {
  rerank(
    question: string,
    chunks: ScoredChunk[],
    topN: number,
  ): Promise<ScoredChunk[]> {
    throw new NotImplementedException(
      'CohereRerankProvider is a documented placeholder for a future lesson — it is not wired up yet. ' +
        'See the comment at the top of cohere-rerank.provider.ts for how to activate it.',
    );
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */
