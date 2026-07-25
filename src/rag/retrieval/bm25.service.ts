import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { VECTOR_STORE } from '../vector-store/vector-store.interface';
import type {
  ChunkMetadata,
  IndexedChunk,
  IVectorStore,
} from '../vector-store/vector-store.interface';
import type { ScoredChunk } from './retrieval.types';

// Standard Okapi BM25 tuning constants: k1 controls term-frequency
// saturation, b controls how much document length is normalized against
// the corpus average. 1.5 / 0.75 are the widely-used textbook defaults.
const K1 = 1.5;
const B = 0.75;

interface Bm25Document {
  text: string;
  metadata: ChunkMetadata;
  termFrequencies: Map<string, number>;
  length: number;
}

/**
 * In-memory BM25 keyword index — the other half of hybrid search alongside
 * VectorSearchService. BM25 needs corpus-wide term/document statistics that
 * a vector database doesn't expose, so it's implemented directly here
 * rather than bolted onto ChromaVectorStoreService.
 *
 * The index is warmed up from the vector store on boot (so a server
 * restart doesn't lose keyword search) and updated incrementally on every
 * upload (so new documents are searchable immediately, without waiting for
 * a restart or a full re-scan of Chroma).
 *
 * Scale note: this is a course-scale, single-process implementation — the
 * whole corpus lives in memory. A multi-instance production deployment
 * would back this with a real search engine (OpenSearch/Elasticsearch/
 * Meilisearch) behind the same addChunks()/search() contract.
 */
@Injectable()
export class BM25Service implements OnModuleInit {
  private readonly logger = new Logger(BM25Service.name);
  private readonly documents = new Map<string, Bm25Document>();
  private readonly documentFrequency = new Map<string, number>();
  private totalDocLength = 0;

  constructor(
    @Inject(VECTOR_STORE) private readonly vectorStore: IVectorStore,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const chunks = await this.vectorStore.getAllChunks();
      this.addChunks(chunks);
      this.logger.log(
        `BM25 index warmed up with ${chunks.length} chunk(s) from the vector store.`,
      );
    } catch {
      this.logger.warn(
        'Could not warm up the BM25 index from ChromaDB (it may not be running yet). It will populate as documents are uploaded.',
      );
    }
  }

  addChunks(chunks: IndexedChunk[]): void {
    for (const chunk of chunks) {
      if (this.documents.has(chunk.id)) continue;

      const terms = this.tokenize(chunk.text);
      const termFrequencies = new Map<string, number>();
      for (const term of terms) {
        termFrequencies.set(term, (termFrequencies.get(term) ?? 0) + 1);
      }

      for (const term of termFrequencies.keys()) {
        this.documentFrequency.set(
          term,
          (this.documentFrequency.get(term) ?? 0) + 1,
        );
      }

      this.documents.set(chunk.id, {
        text: chunk.text,
        metadata: chunk.metadata,
        termFrequencies,
        length: terms.length,
      });
      this.totalDocLength += terms.length;
    }
  }

  search(query: string, topK: number): ScoredChunk[] {
    const totalDocs = this.documents.size;
    if (totalDocs === 0) return [];

    const queryTerms = [...new Set(this.tokenize(query))];
    if (queryTerms.length === 0) return [];

    const avgDocLength = this.totalDocLength / totalDocs;
    const scored: ScoredChunk[] = [];

    for (const [id, doc] of this.documents) {
      const score = this.scoreDocument(
        doc,
        queryTerms,
        totalDocs,
        avgDocLength,
      );
      if (score > 0) {
        scored.push({
          id,
          text: doc.text,
          metadata: doc.metadata,
          vectorScore: 0,
          bm25Score: score,
        });
      }
    }

    return scored.sort((a, b) => b.bm25Score - a.bm25Score).slice(0, topK);
  }

  private scoreDocument(
    doc: Bm25Document,
    queryTerms: string[],
    totalDocs: number,
    avgDocLength: number,
  ): number {
    let score = 0;

    for (const term of queryTerms) {
      const frequency = doc.termFrequencies.get(term);
      if (!frequency) continue;

      const docsWithTerm = this.documentFrequency.get(term) ?? 0;
      const idf = Math.log(
        (totalDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1,
      );
      const normalizedLength = doc.length / avgDocLength;

      score +=
        (idf * (frequency * (K1 + 1))) /
        (frequency + K1 * (1 - B + B * normalizedLength));
    }

    return score;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 1);
  }
}
