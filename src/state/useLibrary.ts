import { useEffect, useSyncExternalStore } from 'react';
import { library, type LibrarySnapshot } from '../data/repository';

/**
 * Subscribe a component to the library.
 *
 * `useSyncExternalStore` keeps every screen on the same snapshot — no context
 * provider, no duplicated fetching, and a write on one screen is visible on the
 * next render everywhere.
 */
export function useLibrary(): LibrarySnapshot {
  useEffect(() => {
    void library.load();
  }, []);

  return useSyncExternalStore(library.subscribe, library.getSnapshot, library.getSnapshot);
}

export { library };
