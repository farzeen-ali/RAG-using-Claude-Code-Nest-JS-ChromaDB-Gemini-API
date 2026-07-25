export const VECTOR_STORE = Symbol('VECTOR_STORE');

export interface ChunkMetadata {
  filename: string;
  pageCount: number;
  uploadedAt: string;
  chunkId: string;
  chunkIndex: number;
}

export interface VectorRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

export interface RetrievedChunk {
  text: string;
  metadata: ChunkMetadata;
  distance: number;
}

export interface IndexedChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

/**
 * Abstraction over the vector database. Ingestion and retrieval code depend
 * only on this interface (injected via the VECTOR_STORE token), so adding
 * Pinecone or hybrid search later means writing a new implementation and
 * swapping one provider registration in RagModule — no other file changes.
 */
export interface IVectorStore {
  upsertChunks(records: VectorRecord[]): Promise<void>;
  querySimilar(embedding: number[], topK: number): Promise<RetrievedChunk[]>;
  /**
   * Returns every indexed chunk (text + metadata, no embeddings needed).
   * Used by BM25Service to warm up its in-memory keyword index from
   * whatever is already in the vector store, so a server restart doesn't
   * lose keyword search until the next upload.
   */
  getAllChunks(): Promise<IndexedChunk[]>;
}
