import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AppConfig } from '../../config/configuration';

export const GEMINI_CLIENT = Symbol('GEMINI_CLIENT');

/**
 * A single GoogleGenAI client is shared by EmbeddingService and GeminiService
 * so the API key is read from config in exactly one place.
 */
export const geminiClientProvider: Provider = {
  provide: GEMINI_CLIENT,
  useFactory: (configService: ConfigService<AppConfig, true>): GoogleGenAI => {
    const apiKey = configService.get('gemini.apiKey', { infer: true });
    return new GoogleGenAI({ apiKey });
  },
  inject: [ConfigService],
};
