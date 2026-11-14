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

    async write(collection, id, doc) {
      data.set(key(collection, id), {
        id, collection, doc, updatedAt: new Date().toISOString(),
      });
    },

    async writeMany(collection, entries) {
      for (const entry of entries) await this.write(collection, entry.id, entry.doc);
    },

    async hardDelete(collection, id) {
      data.delete(key(collection, id));
    },

    async clearCollection(collection) {
      for (const [k, value] of [...data.entries()]) {
        if (value.collection === collection) data.delete(k);
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
