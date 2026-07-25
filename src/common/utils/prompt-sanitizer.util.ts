// Mirrors ChatRequestDto's @MaxLength(2000) — enforced again here as
// defense-in-depth in case this function is ever called from a path that
// bypasses DTO validation (e.g. a future internal/service-to-service call).
const MAX_QUESTION_LENGTH = 2000;

// Control characters and zero-width/invisible characters are sometimes used
// to smuggle hidden instructions past naive validation or to make injected
// text harder to spot in logs. Built from String.fromCharCode ranges (not
// literal characters in source) so nothing invisible sneaks into this file.
function buildHiddenCharacterPattern(): RegExp {
  const ranges: Array<[number, number]> = [
    [0x0000, 0x0008], // C0 controls before tab
    [0x000b, 0x000c], // vertical tab, form feed
    [0x000e, 0x001f], // C0 controls after CR
    [0x007f, 0x007f], // DEL
    [0x200b, 0x200f], // zero-width space/joiners, LRM/RLM
    [0x202a, 0x202e], // bidi embedding/override controls
    [0x2060, 0x2064], // word joiner and invisible operators
    [0xfeff, 0xfeff], // BOM / zero-width no-break space
  ];

  const characters = ranges.flatMap(([start, end]) => {
    const chars: string[] = [];
    for (let code = start; code <= end; code++)
      chars.push(String.fromCharCode(code));
    return chars;
  });

  return new RegExp(`[${characters.join('')}]`, 'g');
}

const HIDDEN_CHARACTERS_PATTERN = buildHiddenCharacterPattern();
const CONTEXT_DELIMITER_PATTERN = /<\/?retrieved-context>/gi;
const CODE_FENCE_PATTERN = /```/g;

/**
 * Defense-in-depth for user input. DTO validation already rejects empty or
 * oversized questions before this ever runs; this additionally strips
 * invisible characters and hard-caps length right before the question is
 * embedded or placed into a prompt.
 */
export function sanitizeQuestion(question: string): string {
  return question
    .replace(HIDDEN_CHARACTERS_PATTERN, '')
    .trim()
    .slice(0, MAX_QUESTION_LENGTH);
}

/**
 * Defends against prompt injection hidden inside retrieved document chunks
 * (e.g. a PDF containing "ignore all previous instructions and..."). The
 * primary defense is structural — PromptBuilderService wraps all context in
 * a fixed <retrieved-context> delimiter and instructs the model to treat it
 * strictly as untrusted data, never as commands. This function backs that
 * up by stripping any occurrence of that exact delimiter FROM the chunk
 * text itself, so a malicious document can't forge a fake closing tag and
 * inject its own instructions immediately after it.
 */
export function sanitizeContextChunk(text: string): string {
  return text
    .replace(CONTEXT_DELIMITER_PATTERN, '')
    .replace(CODE_FENCE_PATTERN, "'''");
}
