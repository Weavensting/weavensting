import { useSyncExternalStore } from 'react';
import type { RecipeDraft } from '../domain/types';

/**
 * Holds the recipe draft being reviewed, between the import screen and the
 * review screen.
 *
 * Router params carry strings; a draft is a nested object with a photo in it.
 * Keeping it in a module-level store avoids serialising it through the URL.
 */

export interface PendingDraft {
  draft: RecipeDraft;
  /** Set when reviewing an edit rather than a new import. */
  editingRecipeId?: string;
}

let pending: PendingDraft | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setPendingDraft(next: PendingDraft | undefined): void {
  pending = next;
  emit();
}

export function getPendingDraft(): PendingDraft | undefined {
  return pending;
}

export function clearPendingDraft(): void {
  setPendingDraft(undefined);
}

export function usePendingDraft(): PendingDraft | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPendingDraft,
    getPendingDraft,
  );
}
