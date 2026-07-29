import { Injectable, Logger } from '@nestjs/common';
import { cosineSimilarity } from '../common/utils/similarity.util';
import { EmbeddingService } from '../rag/embedding/embedding.service';
import { GeminiService } from '../rag/llm/gemini.service';
import type { RetrievedContextChunk } from '../rag/retrieval/retrieval.types';
import type { MetricScoresDto } from './dto/metric-scores.dto';

export interface MetricsInput {
  question: string;
  expectedAnswer: string;
  referenceContext?: string;
  aiAnswer: string;
  retrievedContext: RetrievedContextChunk[];
}

// Cosine similarity above this is treated as "this chunk/sentence is
// relevant to that question/reference" for the precision and recall
// calculations. Gemini embeddings for related sentences typically land
// well above this; unrelated text falls well below it.
const RELEVANCE_THRESHOLD = 0.55;

/**
 * Ragas-inspired evaluation metrics, computed without the Python Ragas
 * library so the whole app stays TypeScript/NestJS:
 *
 * - Faithfulness: LLM-judged (Gemini scores whether the answer's claims are
 *   supported by the retrieved context — this is what actually needs
 *   judgment, not just similarity).
 * - Answer Relevancy: cosine similarity between the question and the AI
 *   answer's embeddings.
 * - Context Precision: rank-weighted precision of the retrieved chunks
 *   against the question (relevant chunks ranked higher score better —
 *   same idea as Ragas' context precision).
 * - Context Recall: fraction of the reference (expected answer, or
 *   referenceContext if provided) whose sentences are attributable to at
 *   least one retrieved chunk.
 * - Overall Quality: plain average of the four.
 *
 * All embedding-based scoring reuses EmbeddingService, which already
 * caches identical text — evaluating the same dataset repeatedly reuses
 * those embeddings for free.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly geminiService: GeminiService,
  ) {}

  async evaluate(input: MetricsInput): Promise<MetricScoresDto> {
    const chunkEmbeddings =
      input.retrievedContext.length > 0
        ? await Promise.all(
            input.retrievedContext.map((chunk) =>
              this.embeddingService.embedForSimilarity(chunk.text),
            ),
          )
        : [];

    const [faithfulness, answerRelevancy, contextPrecision, contextRecall] =
      await Promise.all([
        this.scoreFaithfulness(input),
        this.scoreAnswerRelevancy(input),
        this.scoreContextPrecision(input, chunkEmbeddings),
        this.scoreContextRecall(input, chunkEmbeddings),
      ]);

    const overallQuality = Math.round(
      (faithfulness + answerRelevancy + contextPrecision + contextRecall) / 4,
    );

    return {
      faithfulness,
      answerRelevancy,
      contextPrecision,
      contextRecall,
      overallQuality,
    };
  }

  private async scoreFaithfulness({
    aiAnswer,
    retrievedContext,
  }: MetricsInput): Promise<number> {
    if (retrievedContext.length === 0 || !aiAnswer.trim()) return 0;

    const contextText = retrievedContext
      .map((chunk) => chunk.text)
      .join('\n\n---\n\n');
    const systemInstruction =
      'You are a strict fact-checking judge for a RAG system. You output ONLY a single integer between 0 and 100, nothing else.';
    const userPrompt =
      `Context:\n${contextText}\n\n` +
      `Answer:\n${aiAnswer}\n\n` +
      'On a scale of 0 to 100, what percentage of the factual claims in the Answer are directly supported by the Context ' +
      '(no invented facts, no unsupported claims)? Respond with ONLY the integer score.';

    try {
      const response = await this.geminiService.generateAnswer(
        systemInstruction,
        userPrompt,
      );
      return this.parseScore(response);
    } catch (error) {
      this.logger.warn(
        `Faithfulness judging failed, scoring 0: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  private async scoreAnswerRelevancy({
    question,
    aiAnswer,
  }: MetricsInput): Promise<number> {
    if (!aiAnswer.trim()) return 0;

    const [questionEmbedding, answerEmbedding] = await Promise.all([
      this.embeddingService.embedForSimilarity(question),
      this.embeddingService.embedForSimilarity(aiAnswer),
    ]);

    return this.similarityToPercent(
      cosineSimilarity(questionEmbedding, answerEmbedding),
    );
  }

  /**
   * Rank-weighted precision: chunks arrive already ranked (best first, per
   * RerankService). A chunk is "relevant" if it's similar enough to the
   * question; each relevant chunk contributes (relevant-so-far / position)
   * to the score, so relevant chunks ranked near the top count for more
   * than ones buried lower — the same idea as Ragas' context precision.
   */
  private async scoreContextPrecision(
    { question }: MetricsInput,
    chunkEmbeddings: number[][],
  ): Promise<number> {
    if (chunkEmbeddings.length === 0) return 0;

    const questionEmbedding =
      await this.embeddingService.embedForSimilarity(question);
    const relevanceFlags = chunkEmbeddings.map(
      (chunkEmbedding) =>
        cosineSimilarity(questionEmbedding, chunkEmbedding) >=
        RELEVANCE_THRESHOLD,
    );

    let relevantSoFar = 0;
    let precisionSum = 0;

    relevanceFlags.forEach((isRelevant, index) => {
      if (isRelevant) {
        relevantSoFar += 1;
        precisionSum += relevantSoFar / (index + 1);
      }
    });

    if (relevantSoFar === 0) return 0;
    return Math.round((precisionSum / relevantSoFar) * 100);
  }

  private async scoreContextRecall(
    { expectedAnswer, referenceContext }: MetricsInput,
    chunkEmbeddings: number[][],
  ): Promise<number> {
    const reference = referenceContext?.trim() || expectedAnswer;
    const referenceSentences = this.splitIntoSentences(reference);
    if (referenceSentences.length === 0 || chunkEmbeddings.length === 0)
      return 0;

    const referenceEmbeddings = await Promise.all(
      referenceSentences.map((sentence) =>
        this.embeddingService.embedForSimilarity(sentence),
      ),
    );

    const coveredCount = referenceEmbeddings.filter((sentenceEmbedding) =>
      chunkEmbeddings.some(
        (chunkEmbedding) =>
          cosineSimilarity(sentenceEmbedding, chunkEmbedding) >=
          RELEVANCE_THRESHOLD,
      ),
    ).length;

    return Math.round((coveredCount / referenceSentences.length) * 100);
  }

  private splitIntoSentences(text: string): string[] {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 3);
  }

  private similarityToPercent(similarity: number): number {
    // Cosine similarity is in [-1, 1]; negative values have no meaningful
    // "percent relevancy" reading, so clamp to [0, 1] before scaling.
    return Math.round(Math.max(0, Math.min(1, similarity)) * 100);
  }

  private parseScore(response: string): number {
    const match = /\d+/.exec(response);
    if (!match) return 0;
    return Math.max(0, Math.min(100, parseInt(match[0], 10)));
  }
}
