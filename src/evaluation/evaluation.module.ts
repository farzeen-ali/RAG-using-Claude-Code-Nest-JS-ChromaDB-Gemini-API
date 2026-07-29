import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { DatasetService } from './dataset.service';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { MetricsService } from './metrics.service';
import { ReportService } from './report.service';

/**
 * Ragas-inspired quality evaluation, built entirely on top of the existing
 * pipeline: RagModule's exported EmbeddingService, GeminiService, and
 * RetrievalPipelineService are reused directly — this module adds no new
 * external dependencies (no Ragas/Python, no extra LLM provider).
 */
@Module({
  imports: [RagModule],
  controllers: [EvaluationController],
  providers: [EvaluationService, MetricsService, ReportService, DatasetService],
})
export class EvaluationModule {}
