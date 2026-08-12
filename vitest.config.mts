import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Not jsdom: the only browser global the source needs is `window`, and the
    // scripts/ tests are plain node ESM. See the file for what it aliases.
    setupFiles: ["./src/__tests__/setup.ts"],
    // The release scripts are plain ESM so they stay runnable by node with no
    // build step; tsconfig and eslint cover src/ only, vitest covers both.
    include: ["src/__tests__/**/*.test.ts", "scripts/__tests__/**/*.test.mjs"],
  },
  resolve: {
    alias: {
      // Mock the obsidian module so tests don't need Electron
      obsidian: new URL("./src/__tests__/__mocks__/obsidian.ts", import.meta.url)
        .pathname,
    },
  },
});
