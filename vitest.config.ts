import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    exclude: [...configDefaults.exclude, '**/.worktrees/**'],
  },
});
