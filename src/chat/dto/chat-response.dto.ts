import type { ConfidenceLevel } from '../../rag/retrieval/retrieval.types';

export class ChatResponseDto {
  sessionId: string;
  answer: string;
  sources: string[];
  confidence: ConfidenceLevel;
}
