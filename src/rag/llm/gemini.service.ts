import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { AppConfig } from '../../config/configuration';
import { GEMINI_CLIENT } from './gemini-client.provider';

/**
 * Thin wrapper around Gemini 2.5 Flash text generation. Kept separate from
 * EmbeddingService so either could be swapped or streamed independently
 * (e.g. a future streaming-response feature only touches this file).
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly model: string;

  constructor(
    @Inject(GEMINI_CLIENT) private readonly genAI: GoogleGenAI,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    this.model = this.configService.get('gemini.chatModel', { infer: true });
  }

  async generateAnswer(
    systemInstruction: string,
    userPrompt: string,
  ): Promise<string> {
    try {
      const response = await this.genAI.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }

      return text.trim();
    } catch (error) {
      this.logger.error(
        'Gemini generation request failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'Failed to generate an answer from the language model.',
      );
    }
  }
}
