import { useSyncExternalStore } from 'react';
import { library, type LibrarySnapshot } from '../data/repository';

/**
 * Subscribe a component to the library.
 *
 * `useSyncExternalStore` keeps every screen on the same snapshot — no context
 * provider, no duplicated fetching, and a write on one screen is visible on the
 * next render everywhere. Loading is driven by the session (see
 * `src/data/session.ts`), not by whichever screen mounted first.
 */
export function useLibrary(): LibrarySnapshot {
  return useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
}

export { library };
