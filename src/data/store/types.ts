/**
 * Local persistence: opaque JSON documents keyed by collection and id.
 *
 * This is a **cache**, not a second source of truth. Supabase holds the real
 * data; this exists so the app opens instantly and a recipe stays readable in a
 * kitchen with no signal. The one exception is `outbox`, which holds writes
 * made while offline until they can reach the server.
 *
 * All querying, searching and matching happens in memory over the full set (see
 * `src/data/repository.ts`). A family cookbook is thousands of recipes at most,
 * so this keeps one implementation of the interesting logic — shared by iOS,
 * Android and web — instead of one per storage engine.
 */

export type Collection = 'recipes' | 'cookbooks' | 'pantry' | 'outbox';

/** The collections mirrored from the server, in dependency order. */
export const CACHED_COLLECTIONS = ['cookbooks', 'recipes', 'pantry'] as const;

export interface StoredDocument {
  id: string;
  collection: Collection;
  /** The document itself, already JSON-parsed. */
  doc: unknown;
  updatedAt: string;
}

export interface DocumentStore {
  /** Create tables/objects. Safe to call repeatedly. */
  init(): Promise<void>;
  readAll(collection: Collection): Promise<StoredDocument[]>;
  write(collection: Collection, id: string, doc: unknown): Promise<void>;
  writeMany(collection: Collection, entries: { id: string; doc: unknown }[]): Promise<void>;
  /** Remove a cached row outright. Soft deletes arrive as ordinary writes. */
  hardDelete(collection: Collection, id: string): Promise<void>;
  /** Drop every document in one collection, keeping the others. */
  clearCollection(collection: Collection): Promise<void>;
  /** Small key/value slots for sync cursors and the like. */
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  /** Wipe everything. The cache belongs to a session, so sign-out clears it. */
  clear(): Promise<void>;
}
