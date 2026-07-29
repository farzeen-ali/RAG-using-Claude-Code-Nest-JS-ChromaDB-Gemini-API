import { Injectable } from '@nestjs/common';
import type { EvaluationReportDto } from './dto/evaluation-report.dto';
import type { EvaluationResultDto } from './dto/evaluation-result.dto';
import type { MetricScoresDto } from './dto/metric-scores.dto';

// A test case "passes" when its overall quality score meets this bar.
// Simple and tunable — not part of Ragas itself, just a convenient summary.
const PASS_THRESHOLD = 70;

const EMPTY_SCORES: MetricScoresDto = {
  faithfulness: 0,
  answerRelevancy: 0,
  contextPrecision: 0,
  contextRecall: 0,
  overallQuality: 0,
};

/**
 * Aggregates a batch of EvaluationResultDto into a single report: average
 * score per metric and a pass rate. Kept separate from EvaluationService so
 * "how do we summarize N results" can change (e.g. add percentiles, export
 * formats) without touching how a single evaluation is run.
 */
@Injectable()
export class ReportService {
  buildReport(results: EvaluationResultDto[]): EvaluationReportDto {
    if (results.length === 0) {
      return {
        totalTestCases: 0,
        averages: EMPTY_SCORES,
        passRate: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    const averages: MetricScoresDto = {
      faithfulness: this.average(results, 'faithfulness'),
      answerRelevancy: this.average(results, 'answerRelevancy'),
      contextPrecision: this.average(results, 'contextPrecision'),
      contextRecall: this.average(results, 'contextRecall'),
      overallQuality: this.average(results, 'overallQuality'),
    };

    const passingCount = results.filter(
      (result) => result.metrics.overallQuality >= PASS_THRESHOLD,
    ).length;
    const passRate = Math.round((passingCount / results.length) * 100);

    return {
      totalTestCases: results.length,
      averages,
      passRate,
      generatedAt: new Date().toISOString(),
    };
  }

  private average(
    results: EvaluationResultDto[],
    key: keyof MetricScoresDto,
  ): number {
    const total = results.reduce((sum, result) => sum + result.metrics[key], 0);
    return Math.round(total / results.length);
  }
}
