import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    teardownTimeout: 10000,
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
