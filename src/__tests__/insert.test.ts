import { describe, expect, it } from "vitest";
import {
  appendHeadingWithBlock,
  findHeading,
  insertUnderHeading,
  parseHeadingInput,
  scanHeadings,
} from "../insert.ts";

const BLOCK = "### Run\n\n| Metric | Value |\n|--------|-------|\n| Strain | 12.4 |";

/** Shorthand: parse the user-facing heading string the commands take. */
function target(input: string) {
  const parsed = parseHeadingInput(input);
  if (!parsed) throw new Error(`unparseable heading: ${input}`);
  return parsed;
}

describe("parseHeadingInput", () => {
  it("reads a level from leading hashes", () => {
    expect(parseHeadingInput("## WHOOP")).toEqual({ level: 2, text: "WHOOP" });
    expect(parseHeadingInput("###### Deep")).toEqual({ level: 6, text: "Deep" });
  });

  it("treats a bare name as level-agnostic", () => {
    expect(parseHeadingInput("WHOOP")).toEqual({ level: null, text: "WHOOP" });
  });

  it("trims surrounding whitespace and closing hashes", () => {
    expect(parseHeadingInput("  ##   Training log ##  ")).toEqual({
      level: 2,
      text: "Training log",
    });
  });

  it("rejects empty and hash-only input", () => {
    expect(parseHeadingInput("")).toBeNull();
    expect(parseHeadingInput("   ")).toBeNull();
    expect(parseHeadingInput("###")).toBeNull();
  });

  it("does not read seven hashes as a heading level", () => {
    expect(parseHeadingInput("####### Seven")).toEqual({
      level: null,
      text: "####### Seven",
    });
  });
});

describe("scanHeadings", () => {
  it("skips YAML frontmatter", () => {
    const lines = ["---", "title: Note", "tags: [a]", "---", "", "## WHOOP"];
    expect(scanHeadings(lines)).toEqual([
      { index: 5, level: 2, text: "WHOOP", contentStart: 6 },
    ]);
  });

  it("treats a leading fenced block as frontmatter even if it is not valid YAML", () => {
    // Obsidian parses any leading --- … --- as frontmatter; `#` opens a YAML
    // comment, so a heading in there is metadata, not a section to write into.
    expect(scanHeadings(["---", "", "## WHOOP", "", "---", "", "## Other"])).toEqual([
      { index: 6, level: 2, text: "Other", contentStart: 7 },
    ]);
  });

  it("does not treat an unterminated leading --- as frontmatter", () => {
    expect(scanHeadings(["---", "", "## WHOOP"])).toEqual([
      { index: 2, level: 2, text: "WHOOP", contentStart: 3 },
    ]);
  });

  it("only treats --- as frontmatter on the very first line", () => {
    expect(scanHeadings(["", "---", "title: x", "---", "## WHOOP"])).toContainEqual({
      index: 4,
      level: 2,
      text: "WHOOP",
      contentStart: 5,
    });
  });

  it("ignores headings inside fenced code blocks", () => {
    const lines = ["# Note", "", "```md", "## WHOOP", "```", "", "## WHOOP"];
    expect(scanHeadings(lines)).toEqual([
      { index: 0, level: 1, text: "Note", contentStart: 1 },
      { index: 6, level: 2, text: "WHOOP", contentStart: 7 },
    ]);
  });

  it("handles tilde fences and longer backtick runs", () => {
    const lines = ["~~~", "## Hidden", "~~~", "````", "## Also hidden", "````", "## Real"];
    expect(scanHeadings(lines)).toEqual([
      { index: 6, level: 2, text: "Real", contentStart: 7 },
    ]);
  });

  it("requires a space after the hashes", () => {
    expect(scanHeadings(["##NotAHeading"])).toEqual([]);
  });

  it("reads setext headings, pointing contentStart past the underline", () => {
    expect(scanHeadings(["Big Title", "====", "", "Sub", "----"])).toEqual([
      { index: 0, level: 1, text: "Big Title", contentStart: 2 },
      { index: 3, level: 2, text: "Sub", contentStart: 5 },
    ]);
  });

  it("reads a setext heading that follows an ATX heading", () => {
    expect(scanHeadings(["# One", "Two", "==="])).toEqual([
      { index: 0, level: 1, text: "One", contentStart: 1 },
      { index: 1, level: 1, text: "Two", contentStart: 3 },
    ]);
  });

  it("takes the whole paragraph as the heading text", () => {
    expect(scanHeadings(["first", "second", "==="])).toEqual([
      { index: 0, level: 1, text: "first second", contentStart: 3 },
    ]);
  });

  it("leaves a standalone --- as a thematic break", () => {
    expect(scanHeadings(["para", "", "---", "", "more"])).toEqual([]);
  });

  it("does not read list items, quotes or table rows as setext text", () => {
    expect(scanHeadings(["- item", "---"])).toEqual([]);
    expect(scanHeadings(["> quoted", "---"])).toEqual([]);
    expect(scanHeadings(["| a | b |", "---"])).toEqual([]);
    expect(scanHeadings(["    indented code", "---"])).toEqual([]);
  });

  it("ignores a setext underline inside a code fence", () => {
    expect(scanHeadings(["```", "Title", "=====", "```"])).toEqual([]);
  });
});

describe("findHeading", () => {
  const headings = scanHeadings(["## WHOOP", "### WHOOP", "## **Runs**"]);

  it("matches case-insensitively", () => {
    expect(findHeading(headings, target("whoop"))?.index).toBe(0);
  });

  it("honours an explicit level", () => {
    expect(findHeading(headings, target("### WHOOP"))?.index).toBe(1);
    expect(findHeading(headings, target("#### WHOOP"))).toBeNull();
  });

  it("ignores inline emphasis markers", () => {
    expect(findHeading(headings, target("Runs"))?.index).toBe(2);
  });
});

describe("insertUnderHeading", () => {
  it("reports not found and leaves the content untouched", () => {
    const content = "# Note\n\nSome text I wrote by hand.\n";
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);
    expect(result.found).toBe(false);
    expect(result.content).toBe(content);
  });

  it("reports not found for an empty file", () => {
    const result = insertUnderHeading("", target("## WHOOP"), BLOCK);
    expect(result.found).toBe(false);
    expect(result.content).toBe("");
  });

  it("inserts before the next heading of equal level", () => {
    const content = ["# Log", "", "## WHOOP", "", "Existing note.", "", "## Other", "", "Tail.", ""].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.found).toBe(true);
    expect(result.content).toBe(
      ["# Log", "", "## WHOOP", "", "Existing note.", "", BLOCK, "", "## Other", "", "Tail.", ""].join("\n")
    );
  });

  it("inserts before the next heading of higher level", () => {
    const content = ["## WHOOP", "", "Existing.", "", "# Top level", ""].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content).toBe(
      ["## WHOOP", "", "Existing.", "", BLOCK, "", "# Top level", ""].join("\n")
    );
  });

  it("keeps deeper subsections inside the section", () => {
    const content = [
      "## WHOOP",
      "",
      "### Morning",
      "",
      "a",
      "",
      "### Evening",
      "",
      "b",
      "",
      "## Other",
      "",
    ].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content).toBe(
      [
        "## WHOOP",
        "",
        "### Morning",
        "",
        "a",
        "",
        "### Evening",
        "",
        "b",
        "",
        BLOCK,
        "",
        "## Other",
        "",
      ].join("\n")
    );
  });

  it("handles a heading at the very end of the file", () => {
    const content = "# Log\n\n## WHOOP\n";
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.found).toBe(true);
    expect(result.content).toBe(["# Log", "", "## WHOOP", "", BLOCK, ""].join("\n"));
  });

  it("handles a heading at the end of a file with no trailing newline", () => {
    const result = insertUnderHeading("## WHOOP", target("## WHOOP"), BLOCK);
    expect(result.content).toBe(["## WHOOP", "", BLOCK, ""].join("\n"));
  });

  it("handles a heading followed immediately by another heading", () => {
    const content = "## WHOOP\n## Other\n";
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content).toBe(["## WHOOP", "", BLOCK, "", "## Other", ""].join("\n"));
  });

  it("puts the block directly under the heading in top position", () => {
    const content = ["## WHOOP", "", "Older entry.", "", "## Other", ""].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK, "top");

    expect(result.content).toBe(
      ["## WHOOP", "", BLOCK, "", "Older entry.", "", "## Other", ""].join("\n")
    );
  });

  it("does not match a heading that only appears inside a code fence", () => {
    const content = "# Note\n\n```\n## WHOOP\n```\n";
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);
    expect(result.found).toBe(false);
    expect(result.content).toBe(content);
  });

  it("looks past frontmatter for the heading", () => {
    const content = "---\ntitle: Runs\n---\n\n## WHOOP\n";
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.found).toBe(true);
    expect(result.content).toBe(
      ["---", "title: Runs", "---", "", "## WHOOP", "", BLOCK, ""].join("\n")
    );
  });

  it("does not match a heading of a different level when one is required", () => {
    const content = "### WHOOP\n\nEntry.\n";
    expect(insertUnderHeading(content, target("## WHOOP"), BLOCK).found).toBe(false);
    expect(insertUnderHeading(content, target("WHOOP"), BLOCK).found).toBe(true);
  });

  it("normalises to exactly one blank line of separation", () => {
    const content = ["## WHOOP", "", "", "", "Entry.", "", "", "## Other", ""].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content).toBe(
      ["## WHOOP", "", "", "", "Entry.", "", BLOCK, "", "", "## Other", ""].join("\n")
    );
  });

  it("preserves CRLF line endings", () => {
    const content = "## WHOOP\r\n\r\n## Other\r\n";
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content).toContain("\r\n");
    expect(result.content.split("\r\n")).toEqual([
      "## WHOOP",
      "",
      ...BLOCK.split("\n"),
      "",
      "## Other",
      "",
    ]);
  });

  it("appends a second workout below the first", () => {
    const once = insertUnderHeading("## WHOOP\n", target("## WHOOP"), BLOCK).content;
    const twice = insertUnderHeading(once, target("## WHOOP"), "### Ride\n\nsecond").content;

    expect(twice).toBe(["## WHOOP", "", BLOCK, "", "### Ride", "", "second", ""].join("\n"));
  });

  it("stops at a setext heading instead of running past it", () => {
    // Regression: with only ATX headings recognised, the section ran to EOF and
    // the workout landed under "Later Section" — a different section entirely.
    const content = [
      "## WHOOP",
      "",
      "entry",
      "",
      "Later Section",
      "=============",
      "",
      "prose",
      "",
    ].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content).toBe(
      [
        "## WHOOP",
        "",
        "entry",
        "",
        BLOCK,
        "",
        "Later Section",
        "=============",
        "",
        "prose",
        "",
      ].join("\n")
    );
  });

  it("stops at a dash-underlined setext heading", () => {
    const content = ["## WHOOP", "", "entry", "", "Later", "-----", "", "prose", ""].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content.indexOf(BLOCK)).toBeLessThan(result.content.indexOf("Later"));
  });

  it("can target a setext heading itself", () => {
    const content = ["Training log", "------------", "", "old entry", "", "## Other", ""].join("\n");
    const result = insertUnderHeading(content, target("Training log"), BLOCK);

    expect(result.found).toBe(true);
    expect(result.content).toBe(
      ["Training log", "------------", "", "old entry", "", BLOCK, "", "## Other", ""].join("\n")
    );
  });

  it("keeps a deeper ATX heading inside a setext section", () => {
    // "Training log" is H1 here, so the H2 below nests inside it rather than
    // ending it, and the block belongs after both.
    const content = ["Training log", "============", "", "## Detail", "", "old entry", ""].join("\n");
    const result = insertUnderHeading(content, target("Training log"), BLOCK);

    expect(result.content).toBe(
      ["Training log", "============", "", "## Detail", "", "old entry", "", BLOCK, ""].join("\n")
    );
  });

  it("never splits a setext heading from its underline", () => {
    const content = ["Training log", "============", "", "old entry", ""].join("\n");
    const result = insertUnderHeading(content, target("Training log"), BLOCK, "top");

    expect(result.content).toBe(
      ["Training log", "============", "", BLOCK, "", "old entry", ""].join("\n")
    );
  });

  it("honours a level requirement against a setext heading", () => {
    const content = ["Training log", "------------", "", "entry", ""].join("\n");
    expect(insertUnderHeading(content, target("## Training log"), BLOCK).found).toBe(true);
    expect(insertUnderHeading(content, target("# Training log"), BLOCK).found).toBe(false);
  });

  it("does not find a heading buried in frontmatter", () => {
    const content = "---\ntitle: x\n## WHOOP\n---\n\nprose\n";
    expect(insertUnderHeading(content, target("## WHOOP"), BLOCK).found).toBe(false);
  });

  it("leaves everything outside the section byte-identical", () => {
    const content = ["# Log", "", "Untouched prose.", "", "## WHOOP", "", "## Later", "", "More prose.", ""].join("\n");
    const result = insertUnderHeading(content, target("## WHOOP"), BLOCK);

    expect(result.content.startsWith("# Log\n\nUntouched prose.\n\n## WHOOP\n")).toBe(true);
    expect(result.content.endsWith("## Later\n\nMore prose.\n")).toBe(true);
  });
});

describe("appendHeadingWithBlock", () => {
  it("appends heading and block to a note that lacks the heading", () => {
    const content = "# Note\n\nSome text.\n";
    const result = appendHeadingWithBlock(content, target("## WHOOP"), BLOCK);

    expect(result).toBe(
      ["# Note", "", "Some text.", "", "## WHOOP", "", BLOCK, ""].join("\n")
    );
  });

  it("works on an empty file without a leading blank line", () => {
    const result = appendHeadingWithBlock("", target("## WHOOP"), BLOCK);
    expect(result).toBe(["## WHOOP", "", BLOCK, ""].join("\n"));
  });

  it("works when the file has no trailing newline", () => {
    const result = appendHeadingWithBlock("Text", target("## WHOOP"), BLOCK);
    expect(result).toBe(["Text", "", "## WHOOP", "", BLOCK, ""].join("\n"));
  });

  it("uses the default level when the user typed no hashes", () => {
    const result = appendHeadingWithBlock("Text\n", target("Training"), BLOCK, 2);
    expect(result).toContain("\n## Training\n");
  });

  it("honours an explicit level over the default", () => {
    const result = appendHeadingWithBlock("Text\n", target("#### Training"), BLOCK, 2);
    expect(result).toContain("\n#### Training\n");
  });

  it("produces a document whose new heading is then findable", () => {
    const appended = appendHeadingWithBlock("Text\n", target("## WHOOP"), BLOCK);
    const second = insertUnderHeading(appended, target("## WHOOP"), "### Ride\n\nsecond");
    expect(second.found).toBe(true);
  });
});
