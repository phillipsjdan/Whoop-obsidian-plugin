import tsParser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

// eslint-plugin-obsidianmd 0.4 changed `configs.recommended` from a bare rules
// map into a complete flat config array — it now registers the plugin, pulls in
// typescript-eslint and lints package.json itself. Spreading it into `rules`
// (which is what 0.1.x wanted) makes ESLint read a config object as a rule
// named "0" and refuse to start, so it has to be spread at the top level.
export default [
  // Only the plugin sources are linted. The preset would otherwise reach the
  // build/test tooling and the tests, none of which are in tsconfig's `include`
  // — its type-checked rules error out without type information.
  {
    ignores: [
      "main.js",
      "scripts/**",
      "src/__tests__/**",
      "*.mjs",
      "*.mts",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          enforceCamelCaseLower: true,
          // WHOOP is the official all-caps brand name; the rest are format
          // tokens, URLs and identifiers rather than prose. "cursor" is here
          // because 0.4 added a brand list that contains the Cursor editor,
          // and it rewrites the text caret in "Insert workout at cursor" to
          // match — `brands` replaces the whole list rather than extending it
          // and `ignoreWords` runs after the brand pass, so ignoring the
          // string is the one option that does not discard every other brand.
          ignoreRegex: [
            "WHOOP",
            "URL",
            "HR",
            "ID",
            "YAML",
            "\\bcursor\\b",
            "obsidian://[\\w-]+",
            "\\b(YYYY|YY|MMMM|MMM|MM|DD|ddd|HH|mm|ss)\\b",
          ],
        },
      ],
    },
  },
];
