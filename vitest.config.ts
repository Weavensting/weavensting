import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Only the pure domain/import logic is unit tested here. It has no React Native
 * imports, so it runs in plain Node with no native shims.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // React Native ships Flow source Vite cannot parse; tests never touch the
      // native surface, so a minimal stub stands in for it.
      'react-native': path.resolve(__dirname, 'test/reactNativeStub.ts'),
    },
  },
});
