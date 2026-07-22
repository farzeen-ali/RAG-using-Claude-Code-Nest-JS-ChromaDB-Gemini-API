import { Module } from '@nestjs/common';
import { ChunkingService } from './chunking/chunking.service';
import { EmbeddingService } from './embedding/embedding.service';
import { geminiClientProvider } from './llm/gemini-client.provider';
import { GeminiService } from './llm/gemini.service';
import { PdfService } from './pdf/pdf.service';
import { PromptBuilderService } from './prompt/prompt-builder.service';
import { RagService } from './rag.service';
import { ChromaVectorStoreService } from './vector-store/chroma-vector-store.service';
import { VECTOR_STORE } from './vector-store/vector-store.interface';

/**
 * Groups every building block of the RAG pipeline behind a single module.
 * KnowledgeModule and ChatModule only need RagService — everything else
 * here is an internal implementation detail. To swap Chroma for Pinecone
 * later, replace the `useClass` line below; nothing outside this module
 * needs to change.
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
  ],
  exports: [RagService],
})
export class RagModule {}
