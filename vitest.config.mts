import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mock the obsidian module so tests don't need Electron
      obsidian: new URL("./src/__tests__/__mocks__/obsidian.ts", import.meta.url)
        .pathname,
    },
  },
});
