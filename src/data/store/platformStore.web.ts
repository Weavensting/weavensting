import type { DocumentStore } from './types';
import { createMemoryStore } from './memoryStore';

/**
 * Web storage. IndexedDB when the browser allows it; an in-memory store
 * otherwise, so a private window still runs the app for the current session
 * rather than refusing to start.
 */
export async function createPlatformStore(): Promise<DocumentStore> {
  if (typeof indexedDB === 'undefined') return createMemoryStore();
  const { createIndexedDbStore } = await import('./indexedDbStore');
  return createIndexedDbStore();
}
