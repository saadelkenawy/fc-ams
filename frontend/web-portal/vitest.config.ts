import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        '.next/**',
        'coverage/**',
        'public/**',
        '**/*.d.ts',
        '**/*.config.*',
        'postcss.config.*',
        'tailwind.config.*',
        'next.config.*',
      ],
    },
  },
});
