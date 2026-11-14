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
      PRIMARY KEY (collection, id)
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const UPSERT = `INSERT INTO documents (collection, id, json, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (collection, id) DO UPDATE SET json = excluded.json,
       updated_at = excluded.updated_at`;

  const toStored = (row: DocumentRow): StoredDocument => ({
    id: row.id,
    collection: row.collection as Collection,
    doc: JSON.parse(row.json),
    updatedAt: row.updated_at,
  });

  return {
    async init() {},

    async readAll(collection) {
      const rows = await db.getAllAsync<DocumentRow>(
        'SELECT * FROM documents WHERE collection = ?', collection,
      );
      return rows.map(toStored);
    },

    async write(collection, id, doc) {
      await db.runAsync(UPSERT, collection, id, JSON.stringify(doc), new Date().toISOString());
    },

    async writeMany(collection, entries) {
      if (entries.length === 0) return;
      // One transaction: a half-written cache is worse than a stale one.
      await db.withTransactionAsync(async () => {
        const stamp = new Date().toISOString();
        for (const entry of entries) {
          await db.runAsync(UPSERT, collection, entry.id, JSON.stringify(entry.doc), stamp);
        }
      });
    },

    async hardDelete(collection, id) {
      await db.runAsync('DELETE FROM documents WHERE collection = ? AND id = ?', collection, id);
    },

    async clearCollection(collection) {
      await db.runAsync('DELETE FROM documents WHERE collection = ?', collection);
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
}
