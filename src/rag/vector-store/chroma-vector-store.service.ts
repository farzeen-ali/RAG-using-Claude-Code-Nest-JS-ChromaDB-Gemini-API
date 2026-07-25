import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient, Collection } from 'chromadb';
import { AppConfig } from '../../config/configuration';
import { NoopEmbeddingFunction } from './noop-embedding-function';
import {
  ChunkMetadata,
  IndexedChunk,
  IVectorStore,
  RetrievedChunk,
  VectorRecord,
} from './vector-store.interface';

@Injectable()
export class ChromaVectorStoreService implements IVectorStore, OnModuleInit {
  private readonly logger = new Logger(ChromaVectorStoreService.name);
  private client: ChromaClient;
  private collection: Collection | null = null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const { host, port, ssl, collectionName } = this.configService.get(
      'chroma',
      { infer: true },
    );

    this.client = new ChromaClient({ host, port, ssl });

    try {
      this.collection = await this.client.getOrCreateCollection({
        name: collectionName,
        embeddingFunction: new NoopEmbeddingFunction(),
      });
      this.logger.log(
        `Connected to ChromaDB collection "${collectionName}" at ${host}:${port}`,
      );
    } catch (error) {
      this.logger.error(
        `Could not connect to ChromaDB at ${host}:${port}. Start it with "chroma run --path ./chroma-data" before using the app.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async upsertChunks(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;

    await this.getCollection().upsert({
      ids: records.map((record) => record.id),
      embeddings: records.map((record) => record.embedding),
      documents: records.map((record) => record.text),
      metadatas: records.map(
        (record) =>
          record.metadata as unknown as Record<
            string,
            string | number | boolean
          >,
      ),
    });
  }

  async querySimilar(
    embedding: number[],
    topK: number,
  ): Promise<RetrievedChunk[]> {
    const results = await this.getCollection().query({
      queryEmbeddings: [embedding],
      nResults: topK,
    });

    const documents = results.documents[0] ?? [];
    const metadatas = results.metadatas[0] ?? [];
    const distances = results.distances[0] ?? [];

    const chunks: RetrievedChunk[] = [];
    for (let i = 0; i < documents.length; i++) {
      const text = documents[i];
      const metadata = metadatas[i];
      if (!text || !metadata) continue;
      chunks.push({
        text,
        metadata: metadata as unknown as ChunkMetadata,
        distance: distances[i] ?? 0,
      });
    }

    return chunks;
  }

  async getAllChunks(): Promise<IndexedChunk[]> {
    const result = await this.getCollection().get();
    const chunks: IndexedChunk[] = [];

    for (const row of result.rows()) {
      if (!row.document || !row.metadata) continue;
      chunks.push({
        id: row.id,
        text: row.document,
        metadata: row.metadata as unknown as ChunkMetadata,
      });
    }

    return chunks;
  }

  private getCollection(): Collection {
    if (!this.collection) {
      throw new ServiceUnavailableException(
        'The knowledge base is not reachable right now. Make sure the ChromaDB server is running.',
      );
    }
    return this.collection;
  }
}
