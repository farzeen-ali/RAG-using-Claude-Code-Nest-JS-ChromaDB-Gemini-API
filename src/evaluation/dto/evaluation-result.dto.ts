import type { RetrievedContextChunk } from '../../rag/retrieval/retrieval.types';
import type { MetricScoresDto } from './metric-scores.dto';

export class EvaluationResultDto {
  question: string;
  expectedAnswer: string;
  aiAnswer: string;
  retrievedContext: RetrievedContextChunk[];
  sources: string[];
  metrics: MetricScoresDto;
  evaluatedAt: string;
}
