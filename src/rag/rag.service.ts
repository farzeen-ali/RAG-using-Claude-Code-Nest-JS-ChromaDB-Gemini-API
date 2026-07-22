import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config/configuration';
import { cleanExtractedText } from '../common/utils/text-cleaner.util';
import { convertToMarkdown } from '../common/utils/markdown-converter.util';
import { ChunkingService } from './chunking/chunking.service';
import { EmbeddingService } from './embedding/embedding.service';
import { GeminiService } from './llm/gemini.service';
import { PdfService } from './pdf/pdf.service';
import {
  NO_ANSWER_MESSAGE,
  PromptBuilderService,
} from './prompt/prompt-builder.service';
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

export interface AnswerResult {
  answer: string;
  sources: string[];
}

/**
 * Orchestrates the two RAG workflows (ingestion and question-answering) by
 * composing the single-purpose services below. Controllers only ever talk
 * to this service — none of them know about PDFs, Chroma, or Gemini directly.
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly topK: number;

  constructor(
    private readonly pdfService: PdfService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingService: EmbeddingService,
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    @Inject(VECTOR_STORE) private readonly vectorStore: IVectorStore,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.topK = this.configService.get('retrieval.topK', { infer: true });
  }

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

  async answerQuestion(question: string): Promise<AnswerResult> {
    const queryEmbedding = await this.embeddingService.embedQuery(question);
    const chunks = await this.vectorStore.querySimilar(
      queryEmbedding,
      this.topK,
    );

    if (chunks.length === 0) {
      return { answer: NO_ANSWER_MESSAGE, sources: [] };
    }

    const { systemInstruction, userPrompt } = this.promptBuilder.buildPrompt(
      question,
      chunks,
    );
    const answer = await this.geminiService.generateAnswer(
      systemInstruction,
      userPrompt,
    );
    const sources = [
      ...new Set(chunks.map((chunk) => chunk.metadata.filename)),
    ];

    return { answer, sources };
  }
}
