export interface AppConfig {
  port: number;
  nodeEnv: string;
  gemini: {
    apiKey: string;
    chatModel: string;
    embeddingModel: string;
    embeddingDimensions: number;
  };
  chroma: {
    host: string;
    port: number;
    ssl: boolean;
    collectionName: string;
  };
  chunking: {
    chunkSize: number;
    chunkOverlap: number;
  };
  retrieval: {
    topK: number;
    candidateK: number;
  };
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    chatModel: process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash',
    embeddingModel:
      process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
    embeddingDimensions: parseInt(
      process.env.GEMINI_EMBEDDING_DIMENSIONS ?? '768',
      10,
    ),
  },
  chroma: {
    host: process.env.CHROMA_HOST ?? 'localhost',
    port: parseInt(process.env.CHROMA_PORT ?? '8000', 10),
    ssl: (process.env.CHROMA_SSL ?? 'false').toLowerCase() === 'true',
    collectionName: process.env.CHROMA_COLLECTION_NAME ?? 'knowledge_base',
  },
  chunking: {
    chunkSize: parseInt(process.env.CHUNK_SIZE ?? '800', 10),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP ?? '150', 10),
  },
  retrieval: {
    topK: parseInt(process.env.RETRIEVAL_TOP_K ?? '5', 10),
    candidateK: parseInt(process.env.RETRIEVAL_CANDIDATE_K ?? '10', 10),
  },
});
