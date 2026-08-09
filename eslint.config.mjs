import tsParser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    files: ["src/**/*.ts"],
    ignores: ["src/__tests__/**"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: { obsidianmd },
    rules: {
      ...obsidianmd.configs.recommended,
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          enforceCamelCaseLower: true,
          // WHOOP is the official all-caps brand name; the rest are format
          // tokens, URLs and identifiers rather than prose.
          ignoreRegex: [
            "WHOOP",
            "URL",
            "HR",
            "ID",
            "YAML",
            "obsidian://[\\w-]+",
            "\\b(YYYY|YY|MMMM|MMM|MM|DD|ddd|HH|mm|ss)\\b",
          ],
        },
      ],
    },
  },
];
