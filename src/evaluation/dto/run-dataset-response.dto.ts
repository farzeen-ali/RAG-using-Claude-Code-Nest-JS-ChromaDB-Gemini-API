import type { EvaluationReportDto } from './evaluation-report.dto';
import type { EvaluationResultDto } from './evaluation-result.dto';

export class RunDatasetResponseDto {
  results: EvaluationResultDto[];
  report: EvaluationReportDto;
}
