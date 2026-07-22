import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import pdfParse from 'pdf-parse';

export interface ExtractedPdf {
  text: string;
  pageCount: number;
}

interface PdfParseResult {
  text: string;
  numpages: number;
}

/**
 * Isolates the pdf-parse dependency behind a small service so a future
 * swap (e.g. an OCR pipeline for scanned PDFs) only touches this file.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async extractText(buffer: Buffer): Promise<ExtractedPdf> {
    let result: PdfParseResult;

    try {
      result = await pdfParse(buffer);
    } catch (error) {
      this.logger.error(
        'Failed to parse PDF',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadRequestException(
        'The uploaded file could not be read as a valid PDF.',
      );
    }

    const text = result.text?.trim();

    if (!text) {
      throw new BadRequestException(
        'The PDF has no extractable text. It may be a scanned image without an OCR layer.',
      );
    }

    return { text, pageCount: result.numpages };
  }
}
