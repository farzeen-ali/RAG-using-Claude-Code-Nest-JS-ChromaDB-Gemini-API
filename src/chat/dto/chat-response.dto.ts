import type { ConfidenceLevel } from '../../rag/retrieval/retrieval.types';

export class ChatResponseDto {
  answer: string;
  sources: string[];
  confidence: ConfidenceLevel;
}
