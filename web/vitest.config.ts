import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Pure unit tests only: no jsdom, no network. `@/` mirrors tsconfig paths.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/__tests__/**/*.test.ts'] },
})
