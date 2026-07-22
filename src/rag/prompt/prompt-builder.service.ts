import { Injectable } from '@nestjs/common';
import { RetrievedChunk } from '../vector-store/vector-store.interface';

export const NO_ANSWER_MESSAGE =
  "I couldn't find this information in the uploaded knowledge base.";

const SYSTEM_PROMPT = `You are an enterprise knowledge base assistant.

Answer the user's question using ONLY the information inside the "Context" section of the user message.

Rules:
- Never use outside knowledge, training data, or assumptions beyond the given context.
- Never invent, guess, or fabricate facts, names, numbers, or sources.
- If the context does not contain enough information to answer, respond with EXACTLY this sentence and nothing else:
  "${NO_ANSWER_MESSAGE}"
- Be concise and answer the question directly. Do not mention "the context" or "the documents" in your answer.`;

export interface PromptResult {
  systemInstruction: string;
  userPrompt: string;
}

/**
 * Centralizes the RAG prompt contract in one place so prompt-engineering
 * changes (grounding rules, refusal wording, few-shot examples) never
 * require touching RagService or GeminiService.
 */
@Injectable()
export class PromptBuilderService {
  buildPrompt(question: string, chunks: RetrievedChunk[]): PromptResult {
    const context = chunks
      .map(
        (chunk, index) =>
          `[Source ${index + 1}: ${chunk.metadata.filename}]\n${chunk.text}`,
      )
      .join('\n\n---\n\n');

    return {
      systemInstruction: SYSTEM_PROMPT,
      userPrompt: `Context:\n${context}\n\nQuestion: ${question}`,
    };
  }
}
