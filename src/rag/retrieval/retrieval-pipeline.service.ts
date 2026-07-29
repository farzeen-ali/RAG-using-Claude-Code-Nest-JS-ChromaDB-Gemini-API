import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { sanitizeQuestion } from '../../common/utils/prompt-sanitizer.util';
import { EmbeddingService } from '../embedding/embedding.service';
import { GeminiService } from '../llm/gemini.service';
import {
  NO_ANSWER_MESSAGE,
  PromptBuilderService,
} from '../prompt/prompt-builder.service';
import { RERANK_PROVIDER } from '../rerank/rerank-provider.interface';
import type { IRerankProvider } from '../rerank/rerank-provider.interface';
import { HybridSearchService } from './hybrid-search.service';
import type {
  ConfidenceLevel,
  RetrievedContextChunk,
  ScoredChunk,
} from './retrieval.types';

export interface PipelineResult {
  answer: string;
  sources: string[];
  confidence: ConfidenceLevel;
}

export interface PipelineResultWithContext extends PipelineResult {
  retrievedContext: RetrievedContextChunk[];
}

// Rerank scores are a weighted 0..1 blend (see RerankService) — these
// thresholds are a simple, tunable mapping from "how confident was the
// best matching chunk" to a label the frontend can show the user.
const HIGH_CONFIDENCE_THRESHOLD = 0.65;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.4;

/**
 * The heart of the hybrid RAG pipeline: sanitize -> embed -> hybrid search
 * (vector + BM25) -> rerank -> prompt -> generate. Extracted out of
 * RagService so ingestion and retrieval are independently testable and
 * replaceable — RagService is now just a thin facade that controllers
 * depend on, delegating the actual question-answering to this service.
 */
@Injectable()
export class RetrievalPipelineService {
  private readonly logger = new Logger(RetrievalPipelineService.name);
  private readonly candidateK: number;
  private readonly finalTopK: number;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly hybridSearchService: HybridSearchService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly geminiService: GeminiService,
    @Inject(RERANK_PROVIDER) private readonly rerankProvider: IRerankProvider,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.candidateK = this.configService.get('retrieval.candidateK', {
      infer: true,
    });
    this.finalTopK = this.configService.get('retrieval.topK', { infer: true });
  }

  /** Used by ChatController via RagService — the existing, unchanged /chat contract. */
  async run(rawQuestion: string): Promise<PipelineResult> {
    const { answer, sources, confidence } = await this.execute(rawQuestion);
    return { answer, sources, confidence };
  }

  /**
   * Same pipeline as run(), but also returns the retrieved context chunks
   * that were actually sent to Gemini. Used by the Evaluation module, which
   * needs to display and score the context — /chat intentionally never
   * exposes this, to keep its response shape exactly as it was before.
   */
  async runWithContext(
    rawQuestion: string,
  ): Promise<PipelineResultWithContext> {
    return this.execute(rawQuestion);
  }

  private async execute(
    rawQuestion: string,
  ): Promise<PipelineResultWithContext> {
    const question = sanitizeQuestion(rawQuestion);
    this.logger.log(`Question received: "${question}"`);

    this.logger.log('Generating embedding...');
    const embedding = await this.embeddingService.embedQuery(question);

    const merged = await this.hybridSearchService.search(
      question,
      embedding,
      this.candidateK,
    );

    if (merged.length === 0) {
      this.logger.log(
        'No candidates found from vector or BM25 search. Completed.',
      );
      return {
        answer: NO_ANSWER_MESSAGE,
        sources: [],
        confidence: 'low',
        retrievedContext: [],
      };
    }

    this.logger.log('Re-ranking...');
    const reranked = await this.rerankProvider.rerank(
      question,
      merged,
      this.finalTopK,
    );
    this.logger.log(`Selecting top ${reranked.length}...`);

    const { systemInstruction, userPrompt } = this.promptBuilder.buildPrompt(
      question,
      reranked,
    );

    this.logger.log('Sending context to Gemini...');
    this.logger.log('Generating final response...');
    const answer = await this.geminiService.generateAnswer(
      systemInstruction,
      userPrompt,
    );

    const sources = [
      ...new Set(reranked.map((chunk) => chunk.metadata.filename)),
    ];
    const confidence = this.computeConfidence(reranked);
    const retrievedContext: RetrievedContextChunk[] = reranked.map((chunk) => ({
      text: chunk.text,
      filename: chunk.metadata.filename,
      score: chunk.rerankScore ?? 0,
    }));

    this.logger.log('Completed.');
    return { answer, sources, confidence, retrievedContext };
  }

  private computeConfidence(chunks: ScoredChunk[]): ConfidenceLevel {
    const topScore = chunks[0]?.rerankScore ?? 0;
    if (topScore >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
    if (topScore >= MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
    return 'low';
  }
}
