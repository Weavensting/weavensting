import type { DocumentStore } from './types';

/**
 * Native (iOS/Android) storage. The web build resolves `platformStore.web.ts`
 * instead, which keeps expo-sqlite's WebAssembly worker out of the web bundle
 * entirely — it needs a wasm asset the web bundler cannot resolve.
 */
export async function createPlatformStore(): Promise<DocumentStore> {
  const { createSQLiteStore } = await import('./sqliteStore');
  return createSQLiteStore();
}
