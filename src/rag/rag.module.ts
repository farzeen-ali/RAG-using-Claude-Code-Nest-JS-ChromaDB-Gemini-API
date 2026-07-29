import { Module } from '@nestjs/common';
import { ChunkingService } from './chunking/chunking.service';
import { EmbeddingService } from './embedding/embedding.service';
import { geminiClientProvider } from './llm/gemini-client.provider';
import { GeminiService } from './llm/gemini.service';
import { PdfService } from './pdf/pdf.service';
import { PromptBuilderService } from './prompt/prompt-builder.service';
import { RagService } from './rag.service';
import { CohereRerankProvider } from './rerank/cohere-rerank.provider';
import { RERANK_PROVIDER } from './rerank/rerank-provider.interface';
import { RerankService } from './rerank/rerank.service';
import { BM25Service } from './retrieval/bm25.service';
import { HybridSearchService } from './retrieval/hybrid-search.service';
import { RetrievalPipelineService } from './retrieval/retrieval-pipeline.service';
import { VectorSearchService } from './retrieval/vector-search.service';
import { ChromaVectorStoreService } from './vector-store/chroma-vector-store.service';
import { VECTOR_STORE } from './vector-store/vector-store.interface';

/**
 * Groups every building block of the RAG pipeline behind a single module.
 * KnowledgeModule and ChatModule only need RagService — everything else
 * here is an internal implementation detail.
 *
 * Two deliberate swap points live in this provider list:
 *  - VECTOR_STORE: replace `useClass: ChromaVectorStoreService` with a
 *    Pinecone (or other) implementation of IVectorStore to change vector
 *    databases without touching retrieval code.
 *  - RERANK_PROVIDER: replace `useClass: RerankService` with
 *    `CohereRerankProvider` (see rerank/cohere-rerank.provider.ts) to swap
 *    the local heuristic reranker for a hosted cross-encoder.
 */
@Module({
  providers: [
    PdfService,
    ChunkingService,
    EmbeddingService,
    GeminiService,
    PromptBuilderService,
    RagService,
    geminiClientProvider,
    { provide: VECTOR_STORE, useClass: ChromaVectorStoreService },

    // Hybrid retrieval pipeline (semantic vector search + BM25 keyword search)
    VectorSearchService,
    BM25Service,
    HybridSearchService,
    RetrievalPipelineService,

    // Re-ranking. CohereRerankProvider is registered so it's a real,
    // injectable class (and easy to unit test) but is NOT the active
    // RERANK_PROVIDER — it requires no API key and changes nothing until
    // a future lesson flips the line below.
    RerankService,
    CohereRerankProvider,
    { provide: RERANK_PROVIDER, useClass: RerankService },
  ],
  // EmbeddingService, GeminiService, and RetrievalPipelineService are
  // exported (in addition to RagService) so EvaluationModule can reuse the
  // exact same embedding model and retrieval pipeline the chat endpoint
  // uses, instead of duplicating that logic.
  exports: [
    RagService,
    EmbeddingService,
    GeminiService,
    RetrievalPipelineService,
  ],
})
export class RagModule {}
