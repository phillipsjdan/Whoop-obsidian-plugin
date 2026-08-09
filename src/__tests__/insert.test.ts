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
    const lines = ["---", "title: Note", "tags: [a]", "---", "", "## WHOOP"].slice();
    expect(scanHeadings(lines)).toEqual([{ index: 5, level: 2, text: "WHOOP" }]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const lines = [
      "# Note",
      "",
      "```md",
      "## WHOOP",
      "```",
      "",
      "## WHOOP",
    ];
    expect(scanHeadings(lines)).toEqual([
      { index: 0, level: 1, text: "Note" },
      { index: 6, level: 2, text: "WHOOP" },
    ]);
  });

  it("handles tilde fences and longer backtick runs", () => {
    const lines = ["~~~", "## Hidden", "~~~", "````", "## Also hidden", "````", "## Real"];
    expect(scanHeadings(lines)).toEqual([{ index: 6, level: 2, text: "Real" }]);
  });

  it("requires a space after the hashes", () => {
    expect(scanHeadings(["##NotAHeading"])).toEqual([]);
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
