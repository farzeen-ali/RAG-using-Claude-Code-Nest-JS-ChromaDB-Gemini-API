import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { cleanExtractedText } from '../common/utils/text-cleaner.util';
import { convertToMarkdown } from '../common/utils/markdown-converter.util';
import { BM25Service } from './retrieval/bm25.service';
import { ChunkingService } from './chunking/chunking.service';
import { EmbeddingService } from './embedding/embedding.service';
import { PdfService } from './pdf/pdf.service';
import { VECTOR_STORE } from './vector-store/vector-store.interface';
import type {
  IVectorStore,
  VectorRecord,
} from './vector-store/vector-store.interface';

export interface IngestResult {
  success: true;
  filename: string;
  pageCount: number;
  chunksIndexed: number;
  message: string;
}

/**
 * Public facade for document ingestion (PDF -> clean -> chunk -> embed ->
 * index into Chroma + BM25). Question-answering used to live here too, but
 * now that /chat is memory-aware, ConversationService (src/memory/) owns
 * that flow directly against RetrievalPipelineService — RagService stays
 * focused on ingestion only.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly pdfService: PdfService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly bm25Service: BM25Service,
    @Inject(VECTOR_STORE) private readonly vectorStore: IVectorStore,
  ) {}

  async ingestDocument(file: Express.Multer.File): Promise<IngestResult> {
    const { text, pageCount } = await this.pdfService.extractText(file.buffer);
    const cleanedText = cleanExtractedText(text);
    const markdown = convertToMarkdown(cleanedText);
    const chunks = this.chunkingService.chunkMarkdown(markdown);

    if (chunks.length === 0) {
      throw new BadRequestException(
        'No content could be extracted and chunked from this document.',
      );
    }

    const embeddings = await this.embeddingService.embedDocumentChunks(chunks);
    const uploadedAt = new Date().toISOString();

    const records: VectorRecord[] = chunks.map((chunkText, index) => {
      const chunkId = randomUUID();
      return {
        id: chunkId,
        text: chunkText,
        embedding: embeddings[index],
        metadata: {
          filename: file.originalname,
          pageCount,
          uploadedAt,
          chunkId,
          chunkIndex: index,
        },
      };
    });

    await this.vectorStore.upsertChunks(records);

    // Keeps BM25 keyword search in sync immediately, without waiting for a
    // server restart to re-warm the index from the vector store.
    this.bm25Service.addChunks(
      records.map((record) => ({
        id: record.id,
        text: record.text,
        metadata: record.metadata,
      })),
    );

    this.logger.log(
      `Indexed "${file.originalname}" into ${records.length} chunks (${pageCount} pages).`,
    );

    return {
      success: true,
      filename: file.originalname,
      pageCount,
      chunksIndexed: records.length,
      message: 'Knowledge Base Ready',
    };
  }
}
