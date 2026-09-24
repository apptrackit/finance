import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    // Each suite owns a disposable pair of Workers and their shared database.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
})
