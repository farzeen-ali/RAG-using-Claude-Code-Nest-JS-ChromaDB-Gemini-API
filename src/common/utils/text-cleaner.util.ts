const NON_BREAKING_SPACE = String.fromCharCode(160);

/**
 * Normalizes raw PDF-extracted text before it is chunked and embedded.
 * pdf-parse frequently emits hyphenated line-wraps, stray control characters,
 * and irregular whitespace that would otherwise pollute embeddings.
 */
export function cleanExtractedText(rawText: string): string {
  return rawText
    .split(NON_BREAKING_SPACE)
    .join(' ')
    .replace(/\r\n/g, '\n')
    .replace(/-\n(?=[a-z])/g, '') // rejoin words hyphenated across a line break
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
