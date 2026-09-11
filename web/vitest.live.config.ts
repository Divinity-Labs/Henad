import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Live checks: these talk to a running local fork and a running dev server, so they are
 * deliberately kept out of `pnpm test` (see vitest.config.ts, which only collects
 * `src/**\/__tests__`). Run them by hand after `scripts/local-fork.sh`:
 *
 *   pnpm exec vitest run --config vitest.live.config.ts
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['scripts/**/*.live.ts'],
    // The dev server owns .env.local; this process needs the same addresses.
    env: { NODE_ENV: 'test' },
    setupFiles: ['./scripts/load-env.ts'],
    testTimeout: 120_000,
  },
})
