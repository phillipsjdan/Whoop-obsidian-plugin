/**
 * Heading-targeted insertion into an existing note.
 *
 * Every function here is pure string manipulation over the note's current
 * content: nothing in this module reads or writes the vault. The caller splices
 * and hands the result back, so a note is only ever rewritten with its own
 * content plus the new block — never replaced wholesale.
 */

export type InsertPosition = "top" | "bottom";

export interface HeadingTarget {
  /** Heading text without the leading hashes. */
  text: string;
  /** Required level when the user typed hashes ("## WHOOP"); null means any. */
  level: number | null;
}

export interface HeadingLine {
  index: number;
  level: number;
  text: string;
}

export interface InsertResult {
  content: string;
  /** False when the heading was not found — content is returned unchanged. */
  found: boolean;
  /** Line index the block was inserted at, when found. */
  insertedAt?: number;
}

/** Parses "## WHOOP", "WHOOP", or "  ###  Runs  " into a target. */
export function parseHeadingInput(input: string): HeadingTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withHashes = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (withHashes) {
    const text = stripTrailingHashes(withHashes[2]);
    if (!text) return null;
    return { level: withHashes[1].length, text };
  }

  // A bare string of hashes is not a heading name.
  if (/^#+$/.test(trimmed)) return null;
  return { level: null, text: stripTrailingHashes(trimmed) };
}

/**
 * Lists the ATX headings in a document, skipping YAML frontmatter and anything
 * inside fenced code blocks — a "## Example" in a code sample is not a heading.
 */
export function scanHeadings(lines: string[]): HeadingLine[] {
  const headings: HeadingLine[] = [];
  let index = 0;

  // Skip frontmatter only when the document opens with it.
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (close > 0) index = close + 1;
  }

  let fence: { char: string; length: number } | null = null;

  for (; index < lines.length; index++) {
    const line = lines[index];

    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        // An opening fence may carry an info string; a closing one may not.
        fence = { char, length };
        continue;
      }
      if (char === fence.char && length >= fence.length && !fenceMatch[2].trim()) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const headingMatch = line.match(/^ {0,3}(#{1,6})(?:\s+(.*))?$/);
    if (headingMatch) {
      headings.push({
        index,
        level: headingMatch[1].length,
        text: stripTrailingHashes(headingMatch[2] ?? ""),
      });
    }
  }

  return headings;
}

/** Finds the first heading matching the target, comparing text case-insensitively. */
export function findHeading(
  headings: HeadingLine[],
  target: HeadingTarget
): HeadingLine | null {
  const wanted = normalizeHeadingText(target.text);
  return (
    headings.find(
      (h) =>
        normalizeHeadingText(h.text) === wanted &&
        (target.level === null || h.level === target.level)
    ) ?? null
  );
}

/**
 * Inserts `block` into the section owned by `target`.
 *
 * The section runs from the heading line to the next heading of equal or higher
 * level (or end of file). "top" puts the block directly under the heading;
 * "bottom" puts it at the end of the section, before that next heading.
 *
 * When the heading is absent, the content comes back untouched with
 * `found: false` — deciding what to do about that is the caller's job.
 */
export function insertUnderHeading(
  content: string,
  target: HeadingTarget,
  block: string,
  position: InsertPosition = "bottom"
): InsertResult {
  const eol = detectEol(content);
  const lines = content.split(/\r?\n/);

  const headings = scanHeadings(lines);
  const heading = findHeading(headings, target);
  if (!heading) return { content, found: false };

  const sectionEnd =
    headings.find((h) => h.index > heading.index && h.level <= heading.level)
      ?.index ?? lines.length;

  let insertAt: number;
  if (position === "top") {
    insertAt = heading.index + 1;
  } else {
    insertAt = sectionEnd;
    // Keep the blank lines that separate this section from the next one below
    // the inserted block rather than above it.
    while (insertAt > heading.index + 1 && lines[insertAt - 1].trim() === "") {
      insertAt--;
    }
  }

  const spliced = spliceBlock(lines, insertAt, block);
  return { content: spliced.join(eol), found: true, insertedAt: insertAt };
}

/**
 * Appends the heading followed by the block to the end of the document. Used
 * when the target heading does not exist and the user opts to create it.
 */
export function appendHeadingWithBlock(
  content: string,
  target: HeadingTarget,
  block: string,
  defaultLevel = 2
): string {
  const eol = detectEol(content);
  const lines = content.split(/\r?\n/);
  const level = clampLevel(target.level ?? defaultLevel);
  const headingLine = `${"#".repeat(level)} ${target.text}`;

  const combined = `${headingLine}\n\n${trimBlock(block)}`;
  const spliced = spliceBlock(lines, lines.length, combined);
  return spliced.join(eol);
}

/**
 * Inserts the block at `insertAt`, guaranteeing exactly one blank line of
 * separation from whatever sits on either side.
 */
function spliceBlock(lines: string[], insertAt: number, block: string): string[] {
  const blockLines = trimBlock(block).split("\n");
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);

  const out = [...before];
  if (before.length > 0 && before[before.length - 1].trim() !== "") {
    out.push("");
  }
  out.push(...blockLines);
  if (after.length > 0 && after[0].trim() !== "") {
    out.push("");
  }
  out.push(...after);

  // An empty document starts as [""] — drop that leading blank.
  if (out[0] === "" && before.every((line) => line.trim() === "")) {
    while (out.length > 0 && out[0] === "") out.shift();
  }

  // Always leave a trailing newline.
  if (out.length > 0 && out[out.length - 1] !== "") out.push("");

  return out;
}

function trimBlock(block: string): string {
  return block.replace(/^\n+/, "").replace(/\s+$/, "");
}

function detectEol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function clampLevel(level: number): number {
  return Math.min(6, Math.max(1, Math.round(level)));
}

function stripTrailingHashes(text: string): string {
  return text.replace(/\s+#+\s*$/, "").trim();
}

function normalizeHeadingText(text: string): string {
  // Compare on visible text: fold case and collapse runs of whitespace, and
  // ignore inline markdown emphasis so "## **WHOOP**" matches "WHOOP".
  return text
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
