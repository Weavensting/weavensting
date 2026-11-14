import type { Cookbook, PantryItem, Recipe } from '../domain/types';
import { library } from './repository';
import { getSupabase } from './supabase';
import type { Collection } from './store';

/**
 * Two-way sync between the local store and Supabase.
 *
 * Local-first: every write already succeeded on the device before this runs, so
 * sync is a background reconciliation, never something the cook waits on.
 *
 * Conflicts resolve last-write-wins on `updated_at`. For a family cookbook that
 * is the right trade — two people rarely edit the same recipe in the same
 * minute, and the cost of being wrong is one edit to redo, not lost data (the
 * losing version is still in the row's history on the server).
 */

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out' | 'not-configured';

export interface SyncResult {
  status: SyncStatus;
  pushed: number;
  pulled: number;
  error?: string;
  at: string;
}

const LAST_PULL_KEY = 'sync:last-pull';

export async function sync(): Promise<SyncResult> {
  const at = new Date().toISOString();
  const supabase = getSupabase();
  if (!supabase) return { status: 'not-configured', pushed: 0, pulled: 0, at };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: 'signed-out', pushed: 0, pulled: 0, at };

  const store = library.getStoreForSync();
  if (!store) return { status: 'error', pushed: 0, pulled: 0, error: 'Local store not ready', at };

  try {
    const pushed = await push(auth.user.id);
    const pulled = await pull();
    await store.setMeta(LAST_PULL_KEY, at);
    return { status: 'idle', pushed, pulled, at };
  } catch (error) {
    return {
      status: 'error',
      pushed: 0,
      pulled: 0,
      error: error instanceof Error ? error.message : String(error),
      at,
    };
  }
}

async function push(userId: string): Promise<number> {
  const supabase = getSupabase()!;
  const store = library.getStoreForSync()!;
  const dirty = await store.readDirty();
  if (dirty.length === 0) return 0;

  const byCollection = new Map<Collection, unknown[]>();
  for (const doc of dirty) {
    const list = byCollection.get(doc.collection) ?? [];
    list.push(doc.doc);
    byCollection.set(doc.collection, list);
  }

  let pushed = 0;
  // Cookbooks first: a recipe's row references one, so pushing recipes before
  // their cookbook exists on the server fails the foreign key.
  const order: Collection[] = ['cookbooks', 'recipes', 'pantry'];

  for (const collection of order) {
    const docs = byCollection.get(collection);
    if (!docs || docs.length === 0) continue;

    const rows = docs.map((doc) => toRow(collection, doc, userId));
    const { error } = await supabase.from(tableFor(collection)).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Could not save ${collection}: ${error.message}`);

    await store.markSynced(collection, docs.map((doc) => (doc as { id: string }).id));
    pushed += docs.length;
  }
  return pushed;
}

async function pull(): Promise<number> {
  const supabase = getSupabase()!;
  const store = library.getStoreForSync()!;
  // Pull only what changed since last time; the first run pulls everything.
  const since = (await store.getMeta(LAST_PULL_KEY)) ?? '1970-01-01T00:00:00.000Z';

  let pulled = 0;
  for (const collection of ['cookbooks', 'recipes', 'pantry'] as Collection[]) {
    const { data, error } = await supabase.from(tableFor(collection)).select('*').gt('updated_at', since);

    if (error) throw new Error(`Could not load ${collection}: ${error.message}`);
    if (!data || data.length === 0) continue;

    await library.applyRemote(collection, data.map((row) => fromRow(collection, row)));
    pulled += data.length;
  }
  return pulled;
}

function tableFor(collection: Collection): string {
  return collection === 'pantry' ? 'pantry_items' : collection;
}

/** Domain objects are camelCase; Postgres columns are snake_case. */
function toRow(collection: Collection, doc: unknown, userId: string): Record<string, unknown> {
  if (collection === 'recipes') {
    const r = doc as Recipe;
    return {
      id: r.id,
      cookbook_id: r.cookbookId,
      title: r.title,
      description: r.description ?? null,
      image_uri: r.imageUri ?? null,
      original_image_uris: r.originalImageUris ?? [],
      servings: r.servings,
      prep_minutes: r.prepMinutes ?? null,
      cook_minutes: r.cookMinutes ?? null,
      ingredients: r.ingredients,
      steps: r.steps,
      notes: r.notes ?? null,
      tags: r.tags,
      nutrition: r.nutrition ?? null,
      source: r.source ?? null,
      rating: r.rating ?? null,
      times_cooked: r.timesCooked ?? 0,
      last_cooked_at: r.lastCookedAt ?? null,
      created_by: r.createdBy ?? userId,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      deleted_at: r.deletedAt ?? null,
    };
  }

  if (collection === 'cookbooks') {
    const c = doc as Cookbook;
    return {
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      // A cookbook created before sign-in has no owner yet; it becomes theirs.
      owner_id: c.ownerId ?? userId,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      deleted_at: c.deletedAt ?? null,
    };
  }

  const p = doc as PantryItem;
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    quantity: p.quantity ?? null,
    unit: p.unit ?? null,
    staple: p.staple ?? false,
    expires_at: p.expiresAt ?? null,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt ?? null,
  };
}

function fromRow(collection: Collection, row: Record<string, any>): unknown {
  if (collection === 'recipes') {
    return {
      id: row.id,
      cookbookId: row.cookbook_id,
      title: row.title,
      description: row.description ?? undefined,
      imageUri: row.image_uri ?? undefined,
      originalImageUris: row.original_image_uris ?? undefined,
      servings: row.servings,
      prepMinutes: row.prep_minutes ?? undefined,
      cookMinutes: row.cook_minutes ?? undefined,
      ingredients: row.ingredients ?? [],
      steps: row.steps ?? [],
      notes: row.notes ?? undefined,
      tags: row.tags ?? [],
      nutrition: row.nutrition ?? undefined,
      source: row.source ?? undefined,
      rating: row.rating ?? undefined,
      timesCooked: row.times_cooked ?? 0,
      lastCookedAt: row.last_cooked_at ?? undefined,
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
    } satisfies Recipe;
  }

  if (collection === 'cookbooks') {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      ownerId: row.owner_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
    } satisfies Cookbook;
  }

  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity ?? undefined,
    unit: row.unit ?? undefined,
    staple: row.staple ?? false,
    expiresAt: row.expires_at ?? undefined,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  } satisfies PantryItem;
}
