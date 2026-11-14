/**
 * Persistence is deliberately dumb: it stores opaque JSON documents keyed by
 * collection and id, and nothing else.
 *
 * All querying, searching and matching happens in memory over the full set (see
 * `src/data/repository.ts`). A family cookbook is thousands of recipes at most,
 * so this keeps one implementation of the interesting logic — shared by iOS,
 * Android and web — instead of one per storage engine.
 */

export type Collection = 'recipes' | 'cookbooks' | 'pantry';

export const COLLECTIONS: Collection[] = ['recipes', 'cookbooks', 'pantry'];

export interface StoredDocument {
  id: string;
  collection: Collection;
  /** The document itself, already JSON-parsed. */
  doc: unknown;
  updatedAt: string;
  /** Written locally and not yet pushed to the server. */
  dirty: boolean;
}

export interface DocumentStore {
  /** Create tables/objects. Safe to call repeatedly. */
  init(): Promise<void>;
  readAll(collection: Collection): Promise<StoredDocument[]>;
  /** Insert or replace. `dirty` defaults to true — local edits need syncing. */
  write(collection: Collection, id: string, doc: unknown, dirty?: boolean): Promise<void>;
  writeMany(collection: Collection, entries: { id: string; doc: unknown }[], dirty?: boolean): Promise<void>;
  /** Hard delete. Soft deletes are ordinary writes with `deletedAt` set. */
  hardDelete(collection: Collection, id: string): Promise<void>;
  /** Documents waiting to be pushed to the server. */
  readDirty(): Promise<StoredDocument[]>;
  markSynced(collection: Collection, ids: string[]): Promise<void>;
  /** Small key/value slots for sync cursors and the like. */
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  /** Wipe everything. Used by sign-out and by tests. */
  clear(): Promise<void>;
}
