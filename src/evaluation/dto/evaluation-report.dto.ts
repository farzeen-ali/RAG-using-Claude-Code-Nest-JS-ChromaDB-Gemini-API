import type { MetricScoresDto } from './metric-scores.dto';

export class EvaluationReportDto {
  totalTestCases: number;
  averages: MetricScoresDto;
  /** % of test cases whose overallQuality met the pass threshold (see ReportService). */
  passRate: number;
  generatedAt: string;
}
