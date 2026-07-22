const MAX_HEADING_LENGTH = 80;

/**
 * Heuristically promotes short, punctuation-free, title-like lines to
 * markdown headings so the chunking step can keep section context attached
 * to the text that follows it. PDFs carry no structural metadata, so this
 * is a best-effort reconstruction, not a real markdown parser.
 */
function looksLikeHeading(line: string, nextLine: string | undefined): boolean {
  if (!line || line.length > MAX_HEADING_LENGTH) return false;
  if (/[.;,:]$/.test(line)) return false;

  const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
  const isTitleCase = /^[A-Z0-9][\w'&()/-]*(\s+[A-Z0-9][\w'&()/-]*)*$/.test(
    line,
  );
  const followedByBlankOrShort = !nextLine || nextLine.trim().length === 0;

  return (isAllCaps || isTitleCase) && followedByBlankOrShort;
}

export function convertToMarkdown(cleanedText: string): string {
  const lines = cleanedText.split('\n');
  const output: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      output.push('');
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      output.push(`- ${line.replace(/^[-*•]\s+/, '')}`);
      continue;
    }

    if (looksLikeHeading(line, lines[i + 1])) {
      output.push(`## ${line}`);
      continue;
    }

    output.push(line);
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
