import { defineConfig } from 'vitest/config'
import GithubActionsReporter from 'vitest-github-actions-reporter'

export default defineConfig({
  test: {
    testTimeout: 300_000,
    hookTimeout: 150_000,
    teardownTimeout: 15_000,
    silent: true,
    maxConcurrency: 3,
    // slowTestThreshold: 120_000;
    reporters: process.env.GITHUB_ACTIONS
      ? ['default', new GithubActionsReporter()]
      : 'default'
  }
})