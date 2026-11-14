import type { Collection, DocumentStore, StoredDocument } from './types';

const DB_NAME = 'family-cookbook';
const DB_VERSION = 1;
const DOCS = 'documents';
const META = 'meta';

interface DocumentRecord {
  key: string;
  collection: Collection;
  id: string;
  doc: unknown;
  updatedAt: string;
}

/**
 * IndexedDB store for the web build. Hand-rolled over the raw API rather than
 * pulling in a wrapper — the surface we need is four operations wide.
 */
export async function createIndexedDbStore(): Promise<DocumentStore> {
  const db = await openDatabase();
  const key = (collection: Collection, id: string) => `${collection}:${id}`;

  const run = <T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    body: (tx: IDBTransaction) => Promise<T> | T,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      Promise.resolve(body(tx)).then(
        (value) => {
          result = value;
        },
        (error) => {
          reject(error);
          try {
            tx.abort();
          } catch {
            // Already finished; nothing to abort.
          }
        },
      );
    });

  const toStored = (record: DocumentRecord): StoredDocument => ({
    id: record.id,
    collection: record.collection,
    doc: record.doc,
    updatedAt: record.updatedAt,
  });

  return {
    async init() {},

    async readAll(collection) {
      const records = await run(DOCS, 'readonly', (tx) =>
        request<DocumentRecord[]>(tx.objectStore(DOCS).index('collection').getAll(collection)),
      );
      return records.map(toStored);
    },

    async write(collection, id, doc) {
      await run(DOCS, 'readwrite', (tx) =>
        request(
          tx.objectStore(DOCS).put({
            key: key(collection, id), collection, id, doc,
            updatedAt: new Date().toISOString(),
          } satisfies DocumentRecord),
        ),
      );
    },

    async writeMany(collection, entries) {
      if (entries.length === 0) return;
      await run(DOCS, 'readwrite', (tx) => {
        const store = tx.objectStore(DOCS);
        const updatedAt = new Date().toISOString();
        for (const entry of entries) {
          store.put({
            key: key(collection, entry.id), collection, id: entry.id, doc: entry.doc, updatedAt,
          } satisfies DocumentRecord);
        }
      });
    },

    async hardDelete(collection, id) {
      await run(DOCS, 'readwrite', (tx) => request(tx.objectStore(DOCS).delete(key(collection, id))));
    },

    async clearCollection(collection) {
      await run(DOCS, 'readwrite', async (tx) => {
        const index = tx.objectStore(DOCS).index('collection');
        const keys = await request<IDBValidKey[]>(index.getAllKeys(collection));
        for (const k of keys) tx.objectStore(DOCS).delete(k);
      });
    },

    async getMeta(k) {
      const record = await run(META, 'readonly', (tx) =>
        request<{ key: string; value: string } | undefined>(tx.objectStore(META).get(k)),
      );
      return record?.value;
    },

    async setMeta(k, value) {
      await run(META, 'readwrite', (tx) => request(tx.objectStore(META).put({ key: k, value })));
    },

    async clear() {
      await run([DOCS, META], 'readwrite', (tx) => {
        tx.objectStore(DOCS).clear();
        tx.objectStore(META).clear();
      });
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DOCS)) {
        const store = db.createObjectStore(DOCS, { keyPath: 'key' });
        store.createIndex('collection', 'collection');
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
