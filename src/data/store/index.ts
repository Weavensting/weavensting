import type { DocumentStore } from './types';
import { createMemoryStore } from './memoryStore';

export * from './types';
export { createMemoryStore } from './memoryStore';

let cached: Promise<DocumentStore> | undefined;

/**
 * The right store for the platform: SQLite on iOS/Android, IndexedDB on the
 * web. Which one is chosen by the bundler, via `platformStore.web.ts` — not by
 * a runtime check — so neither platform ships the other's storage engine.
 */
export function getStore(): Promise<DocumentStore> {
  cached ??= create();
  return cached;
}

async function create(): Promise<DocumentStore> {
  try {
    const { createPlatformStore } = await import('./platformStore');
    return await createPlatformStore();
  } catch (error) {
    // Losing persistence should degrade the app, not break it.
    console.warn('[store] persistent storage unavailable, using memory only', error);
    return createMemoryStore();
  }
}

/** Test seam: swap in a store (usually the memory one) before anything reads it. */
export function __setStoreForTesting(store: DocumentStore | undefined): void {
  cached = store ? Promise.resolve(store) : undefined;
}
