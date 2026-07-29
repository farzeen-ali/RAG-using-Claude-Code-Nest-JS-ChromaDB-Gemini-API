import { Injectable, Logger } from '@nestjs/common';
import { RetrievalPipelineService } from '../rag/retrieval/retrieval-pipeline.service';
import { EvaluationResultDto } from './dto/evaluation-result.dto';
import { RunEvaluationDto } from './dto/run-evaluation.dto';
import { MetricsService } from './metrics.service';

/**
 * Runs a test case through the exact same retrieval + generation pipeline
 * the /chat endpoint uses (via RetrievalPipelineService.runWithContext,
 * which additionally exposes the chunks that were sent to Gemini), then
 * scores the result with MetricsService. This is the only service that
 * knows how to produce a single EvaluationResultDto — DatasetService and
 * ReportService each own a different concern (loading test cases,
 * summarizing results) and don't depend on this one.
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly retrievalPipeline: RetrievalPipelineService,
    private readonly metricsService: MetricsService,
  ) {}

  async runSingle(testCase: RunEvaluationDto): Promise<EvaluationResultDto> {
    const pipelineResult = await this.retrievalPipeline.runWithContext(
      testCase.question,
    );

    const metrics = await this.metricsService.evaluate({
      question: testCase.question,
      expectedAnswer: testCase.expectedAnswer,
      referenceContext: testCase.referenceContext,
      aiAnswer: pipelineResult.answer,
      retrievedContext: pipelineResult.retrievedContext,
    });

    const result = new EvaluationResultDto();
    result.question = testCase.question;
    result.expectedAnswer = testCase.expectedAnswer;
    result.aiAnswer = pipelineResult.answer;
    result.retrievedContext = pipelineResult.retrievedContext;
    result.sources = pipelineResult.sources;
    result.metrics = metrics;
    result.evaluatedAt = new Date().toISOString();
    return result;
  }

  async runMany(testCases: RunEvaluationDto[]): Promise<EvaluationResultDto[]> {
    const results: EvaluationResultDto[] = [];

    // Sequential on purpose: each test case triggers several Gemini calls
    // (embeddings + generation + faithfulness judging); running a dataset
    // in parallel would risk hitting API rate limits for no real benefit
    // at course-project dataset sizes.
    for (const [index, testCase] of testCases.entries()) {
      this.logger.log(
        `Evaluating test case ${index + 1}/${testCases.length}: "${testCase.question}"`,
      );
      results.push(await this.runSingle(testCase));
    }

    return results;
  }
}
