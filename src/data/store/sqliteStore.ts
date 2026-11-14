import type * as SQLite from 'expo-sqlite';
import type { Collection, DocumentStore, StoredDocument } from './types';

const DB_NAME = 'family-cookbook.db';

/**
 * SQLite store for iOS and Android.
 *
 * One table holds every collection. Documents stay as JSON so adding a field to
 * a recipe never needs a schema migration — the only migrations that matter are
 * the ones inside `src/domain`.
 */
export async function createSQLiteStore(): Promise<DocumentStore> {
  const SQLiteModule: typeof SQLite = await import('expo-sqlite');
  const db = await SQLiteModule.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS documents (
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      json       TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      dirty      INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS documents_dirty ON documents (dirty);
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const UPSERT = `INSERT INTO documents (collection, id, json, updated_at, dirty) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (collection, id) DO UPDATE SET json = excluded.json,
       updated_at = excluded.updated_at, dirty = excluded.dirty`;

  const toStored = (row: DocumentRow): StoredDocument => ({
    id: row.id,
    collection: row.collection as Collection,
    doc: JSON.parse(row.json),
    updatedAt: row.updated_at,
    dirty: row.dirty === 1,
  });

  return {
    async init() {},

    async readAll(collection) {
      const rows = await db.getAllAsync<DocumentRow>(
        'SELECT * FROM documents WHERE collection = ?', collection,
      );
      return rows.map(toStored);
    },

    async write(collection, id, doc, dirty = true) {
      await db.runAsync(UPSERT, collection, id, JSON.stringify(doc), new Date().toISOString(), dirty ? 1 : 0);
    },

    async writeMany(collection, entries, dirty = true) {
      if (entries.length === 0) return;
      // One transaction: a partially-applied sync batch would be worse than none.
      await db.withTransactionAsync(async () => {
        const stamp = new Date().toISOString();
        for (const entry of entries) {
          await db.runAsync(UPSERT, collection, entry.id, JSON.stringify(entry.doc), stamp, dirty ? 1 : 0);
        }
      });
    },

    async hardDelete(collection, id) {
      await db.runAsync('DELETE FROM documents WHERE collection = ? AND id = ?', collection, id);
    },

    async readDirty() {
      const rows = await db.getAllAsync<DocumentRow>('SELECT * FROM documents WHERE dirty = 1');
      return rows.map(toStored);
    },

    async markSynced(collection, ids) {
      if (ids.length === 0) return;
      const placeholders = ids.map(() => '?').join(', ');
      await db.runAsync(
        `UPDATE documents SET dirty = 0 WHERE collection = ? AND id IN (${placeholders})`,
        collection, ...ids,
      );
    },

    async getMeta(key) {
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
      return row?.value;
    },

    async setMeta(key, value) {
      await db.runAsync(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
        key, value,
      );
    },

    async clear() {
      await db.execAsync('DELETE FROM documents; DELETE FROM meta;');
    },
  };
}

interface DocumentRow {
  collection: string;
  id: string;
  json: string;
  updated_at: string;
  dirty: number;
}
