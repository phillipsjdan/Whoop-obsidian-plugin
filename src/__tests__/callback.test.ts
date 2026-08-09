import { describe, expect, it } from "vitest";
import { describeError } from "../main.ts";

describe("describeError", () => {
  it("turns a form-encoded description into a sentence", () => {
    // Obsidian's protocol handler percent-decodes but leaves `+` alone, so this
    // is exactly what an invalid-scope rejection arrives as.
    expect(
      describeError({
        error: "invalid_scope",
        error_description: "The+requested+scope+is+invalid,+unknown,+or+malformed",
      })
    ).toBe("The requested scope is invalid, unknown, or malformed");
  });

  it("falls back to the error code when there is no description", () => {
    expect(describeError({ error: "access_denied" })).toBe("access_denied");
  });

  it("says something rather than nothing when both are absent", () => {
    expect(describeError({})).toBe("no reason given");
  });
});
