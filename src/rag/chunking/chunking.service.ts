import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

const SEPARATORS = ['\n\n', '\n', '. ', ' '];

interface HeadingSection {
  heading: string | null;
  body: string;
}

/**
 * Recursive character splitter (paragraph -> line -> sentence -> word),
 * matching the strategy used by most production RAG pipelines: try the
 * "softest" separator first so sentences and paragraphs stay intact, and
 * only fall back to a hard cut when a single unit is still too long.
 */
@Injectable()
export class ChunkingService {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.chunkSize = this.configService.get('chunking.chunkSize', {
      infer: true,
    });
    this.chunkOverlap = this.configService.get('chunking.chunkOverlap', {
      infer: true,
    });
  }

  chunkMarkdown(markdown: string): string[] {
    const sections = this.splitIntoHeadingSections(markdown);
    const chunks: string[] = [];

    for (const section of sections) {
      const pieces = this.recursiveSplit(section.body, SEPARATORS);
      for (const piece of pieces) {
        const text = section.heading ? `${section.heading}\n${piece}` : piece;
        if (text.trim()) chunks.push(text.trim());
      }
    }

    return chunks;
  }

  private splitIntoHeadingSections(markdown: string): HeadingSection[] {
    const lines = markdown.split('\n');
    const sections: HeadingSection[] = [];
    let currentHeading: string | null = null;
    let buffer: string[] = [];

    const flush = () => {
      const body = buffer.join('\n').trim();
      if (body) sections.push({ heading: currentHeading, body });
      buffer = [];
    };

    for (const line of lines) {
      if (/^#{1,6}\s+/.test(line)) {
        flush();
        currentHeading = line.trim();
      } else {
        buffer.push(line);
      }
    }
    flush();

    return sections.length > 0 ? sections : [{ heading: null, body: markdown }];
  }

  private recursiveSplit(text: string, separators: string[]): string[] {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];
    if (trimmed.length <= this.chunkSize) return [trimmed];

    const [separator, ...rest] = separators;
    if (!separator) return this.hardSplitWithOverlap(trimmed);

    const parts = trimmed.split(separator).filter((part) => part.length > 0);
    if (parts.length <= 1) return this.recursiveSplit(trimmed, rest);

    return this.mergeIntoChunks(parts, separator, rest);
  }

  private mergeIntoChunks(
    parts: string[],
    separator: string,
    remainingSeparators: string[],
  ): string[] {
    const chunks: string[] = [];
    let current = '';

    const flushCurrent = () => {
      if (!current.trim()) return;
      if (current.length > this.chunkSize) {
        chunks.push(...this.recursiveSplit(current, remainingSeparators));
      } else {
        chunks.push(current);
      }
      current = '';
    };

    for (const part of parts) {
      const candidate = current ? `${current}${separator}${part}` : part;

      if (candidate.length <= this.chunkSize) {
        current = candidate;
        continue;
      }

      if (current) {
        const overlapSeed = this.buildOverlapSeed(current);
        flushCurrent();
        current = overlapSeed ? `${overlapSeed}${separator}${part}` : part;
      } else {
        chunks.push(...this.recursiveSplit(part, remainingSeparators));
      }
    }

    flushCurrent();
    return chunks;
  }

  private buildOverlapSeed(previousChunk: string): string {
    if (this.chunkOverlap <= 0) return '';
    return previousChunk.slice(-this.chunkOverlap);
  }

  private hardSplitWithOverlap(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      const piece = text.slice(start, end).trim();
      if (piece) chunks.push(piece);
      if (end === text.length) break;
      start = end - this.chunkOverlap;
    }

    return chunks;
  }
}
