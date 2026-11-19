import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests use a throwaway SQLite database in the OS temp folder (never your own data).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/integration/**/*.test.ts"], fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000 },
});
