import type { Collection, DocumentStore, StoredDocument } from './types';

/**
 * In-process store. Used by tests, and as the fallback when neither SQLite nor
 * IndexedDB is available (private browsing, unusual runtimes) so the app still
 * works for the current session rather than refusing to start.
 */
export function createMemoryStore(): DocumentStore {
  const data = new Map<string, StoredDocument>();
  const meta = new Map<string, string>();
  const key = (collection: Collection, id: string) => `${collection}:${id}`;

  return {
    async init() {},

    async readAll(collection) {
      return [...data.values()].filter((d) => d.collection === collection);
    },

    async write(collection, id, doc, dirty = true) {
      data.set(key(collection, id), {
        id, collection, doc, updatedAt: new Date().toISOString(), dirty,
      });
    },

    async writeMany(collection, entries, dirty = true) {
      for (const entry of entries) await this.write(collection, entry.id, entry.doc, dirty);
    },

    async hardDelete(collection, id) {
      data.delete(key(collection, id));
    },

    async readDirty() {
      return [...data.values()].filter((d) => d.dirty);
    },

    async markSynced(collection, ids) {
      for (const id of ids) {
        const existing = data.get(key(collection, id));
        if (existing) existing.dirty = false;
      }
    },

    async getMeta(k) {
      return meta.get(k);
    },

    async setMeta(k, value) {
      meta.set(k, value);
    },

    async clear() {
      data.clear();
      meta.clear();
    },
  };
}
