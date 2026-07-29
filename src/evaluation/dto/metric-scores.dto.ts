/**
 * All scores are 0-100. See MetricsService for how each is computed.
 */
export interface MetricScoresDto {
  faithfulness: number;
  answerRelevancy: number;
  contextPrecision: number;
  contextRecall: number;
  overallQuality: number;
}
