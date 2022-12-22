import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 600_000,
    hookTimeout: 300_000,
    teardownTimeout: 15_000,
    // silent: true,
    // maxConcurrency: 5,
    // slowTestThreshold: 120_000;
  },
})
