// ---------------------------------------------------------------------------
// "The tests pass." Did they? PURE.
// ---------------------------------------------------------------------------
//
// The number-one complaint about coding agents is being told a suite is green
// when nobody ran it. The Stop hook's job is to
// notice a session that CLAIMS a pass and has no recorded run to back it.
//
// The bar is deliberately conservative. This produces a warning that costs the
// user a few seconds, so a false positive is cheap; but it is also the text a
// human reads at the end of a session, so it must not fire on "make sure the
// tests pass before merging" or "the tests do not pass yet".

/** Phrases that assert a green suite. */
const CLAIM_PATTERNS = [
  /\b(?:all|every)\s+(?:the\s+)?(?:\d+\s+)?(?:unit\s+|e2e\s+|integration\s+)?tests?\s+(?:are\s+|now\s+)*(?:pass(?:ing|ed)?|green)\b/i,
  /\b(?:the\s+)?(?:test\s+)?suite\s+is\s+(?:now\s+)?(?:green|passing)\b/i,
  /\btests?\s+(?:are\s+|now\s+)*(?:all\s+)?(?:pass(?:ing|ed)|green)\b/i,
  /\beverything\s+(?:is\s+)?(?:pass(?:ing|es)?|green)\b/i,
  /\b\d+\s+passed\b(?![^\n]*\bfailed\b)/i,
];

/**
 * Context that turns a claim into a non-claim, wherever it sits in the sentence:
 * a negation, a failure word, or a question.
 */
const NEGATION_PATTERNS = [
  /\b(?:not|never|don't|dont|doesn't|doesnt|didn't|didnt|won't|wont|cannot|can't|cant)\b/i,
  /\b(?:fail(?:s|ed|ing)?|error(?:s|ed)?|red)\b/i,
  /\?\s*$/,
];

/**
 * Words that make the claim conditional — but ONLY when they come BEFORE it.
 * "Make sure the tests pass" is an instruction; "tests are passing after the
 * fix" is a claim, and the difference is word order, not vocabulary.
 */
const CONDITIONAL_PREFIX =
  /\b(?:if|once|when|whether|until|unless|before|after|make sure|makes sure|ensure|ensures|verify|verifies|check|checks|confirm|confirms|should|would|could|must|need to|needs to|let's|lets|hoping|hope)\b/i;

/** One sentence, minus code fences and shell prompts. */
export function sentences(text) {
  if (typeof text !== 'string' || !text) return [];
  const withoutFences = text.replace(/```[\s\S]*?```/g, ' ');
  return withoutFences
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Does this text assert that tests pass, without hedging or negating it? */
export function claimsTestsPass(text) {
  for (const sentence of sentences(text)) {
    let at = -1;
    for (const pattern of CLAIM_PATTERNS) {
      const match = pattern.exec(sentence);
      if (match && (at === -1 || match.index < at)) at = match.index;
    }
    if (at === -1) continue;
    if (NEGATION_PATTERNS.some((p) => p.test(sentence))) continue;
    const conditional = CONDITIONAL_PREFIX.exec(sentence);
    if (conditional && conditional.index < at) continue;
    return sentence.length > 240 ? `${sentence.slice(0, 239)}…` : sentence;
  }
  return undefined;
}

/**
 * Pull the assistant's own words out of a Claude Code transcript (JSONL, one
 * message per line) and return the most recent pass-claim, if any.
 *
 * Only ASSISTANT text counts. A user saying "the tests pass on my machine" is
 * information, not a claim the session has to back up; and tool OUTPUT saying
 * "3 passed" is exactly the case the recorder should have caught, which the
 * run-state check already covers.
 */
export function findPassClaim(lines, options = {}) {
  const limit = options.limit ?? 40;
  const rows = Array.isArray(lines) ? lines : [];
  const tail = rows.slice(-limit);
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const text = assistantText(tail[i]);
    if (!text) continue;
    const claim = claimsTestsPass(text);
    if (claim) return claim;
  }
  return undefined;
}

/** Extract assistant prose from one transcript line (string or parsed entry). */
export function assistantText(line) {
  let entry = line;
  if (typeof line === 'string') {
    const trimmed = line.trim();
    if (!trimmed) return undefined;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!entry || typeof entry !== 'object') return undefined;
  const role = entry.role ?? entry.message?.role ?? entry.type;
  if (role !== 'assistant') return undefined;
  const content = entry.message?.content ?? entry.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}
