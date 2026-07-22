import type { EmbeddingFunction } from 'chromadb';

/**
 * Every Chroma collection must be associated with an embedding function.
 * This app always computes embeddings itself via Gemini and passes them
 * explicitly to upsert()/query(), so Chroma's own embedding function is
 * never invoked — this stub exists only to satisfy that requirement
 * without pulling in the optional @chroma-core/default-embed package.
 */
export class NoopEmbeddingFunction implements EmbeddingFunction {
  name = 'gemini-external';

  generate(): Promise<number[][]> {
    return Promise.reject(
      new Error(
        'NoopEmbeddingFunction.generate() was invoked. Embeddings must always be supplied explicitly via EmbeddingService.',
      ),
    );
  }
}
