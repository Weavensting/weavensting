import type { Cookbook, ID, PantryItem, Recipe } from '../domain/types';
import { newId, nowISO } from '../domain/id';
import { getStore, CACHED_COLLECTIONS, type Collection, type DocumentStore } from './store';
import * as remote from './remote';
import { RemoteError } from './remote';
import * as outbox from './outbox';
import type { PendingOp, PendingOpInput } from './outbox';

export interface LibrarySnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error';
  recipes: Recipe[];
  cookbooks: Cookbook[];
  pantry: PantryItem[];
  /** False once a request has failed for want of a network. */
  online: boolean;
  /** Writes waiting to reach the server. */
  pending: number;
  /** Ids showing an optimistic value the server has not confirmed yet. */
  pendingIds: string[];
  error?: string;
}

const EMPTY: LibrarySnapshot = {
  status: 'idle',
  recipes: [],
  cookbooks: [],
  pantry: [],
  online: true,
  pending: 0,
  pendingIds: [],
};

const CACHE_OWNER_KEY = 'cache:user-id';

type Listener = () => void;

/**
 * The app's view of the collective cookbook.
 *
 * Supabase is the source of truth. This holds a copy in memory so screens read
 * synchronously, and mirrors it to the device so the app opens instantly and a
 * recipe stays readable in a kitchen with no signal.
 *
 * Writes go to the server and the row the server returns is what gets kept —
 * never the object the app sent. There is no client-side merge and no
 * last-write-wins: two people editing the same recipe are serialised by the
 * database, like any other shared system. When a write cannot reach the server
 * it is applied optimistically and queued in the outbox, and the screen says so.
 */
class Library {
  private snapshot: LibrarySnapshot = EMPTY;
  private listeners = new Set<Listener>();
  private store?: DocumentStore;
  private userId?: string;
  private loading?: Promise<void>;

  getSnapshot = (): LibrarySnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Begin for a signed-in person. Idempotent for the same user; signing in as
   * someone else drops the previous person's cache first.
   */
  start = (userId: string): Promise<void> => {
    if (this.userId === userId && this.loading) return this.loading;
    this.userId = userId;
    this.loading = this.load(userId);
    return this.loading;
  };

  /** Sign-out. The cache is the server's data, so it does not outlive the session. */
  stop = async (): Promise<void> => {
    const store = this.store;
    this.userId = undefined;
    this.loading = undefined;
    this.publish(EMPTY);
    await store?.clear();
  };

  private async load(userId: string): Promise<void> {
    this.publish({ ...EMPTY, status: 'loading' });

    try {
      const store = await getStore();
      await store.init();
      this.store = store;

      // A cache belongs to one account; never show it to another.
      const cachedOwner = await store.getMeta(CACHE_OWNER_KEY);
      if (cachedOwner && cachedOwner !== userId) await store.clear();
      await store.setMeta(CACHE_OWNER_KEY, userId);

      await this.showCache();
      await this.refresh();
    } catch (error) {
      this.publish({
        ...this.snapshot,
        status: this.snapshot.recipes.length > 0 ? 'ready' : 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Put whatever is on the device on screen immediately, before any request. */
  private async showCache(): Promise<void> {
    const store = this.store;
    if (!store) return;

    const [cookbooks, recipes, pantry, pending] = await Promise.all([
      store.readAll('cookbooks').then((d) => d.map((x) => x.doc as Cookbook)),
      store.readAll('recipes').then((d) => d.map((x) => x.doc as Recipe)),
      store.readAll('pantry').then((d) => d.map((x) => x.doc as PantryItem)),
      outbox.queueLength(store),
    ]);

    if (cookbooks.length === 0 && recipes.length === 0) return;
    this.publish({ ...this.snapshot, status: 'ready', cookbooks, recipes, pantry, pending });
  }

  /** Pull the server's current state and replace the cache with it. */
  refresh = async (): Promise<void> => {
    const store = this.store;
    if (!store || !this.userId) return;

    try {
      // Anything written while offline goes up before we read, or the refresh
      // would overwrite it with the server's older copy.
      await this.flush();

      await remote.ensureDefaultCookbook();
      const fresh = await remote.fetchEverything();

      for (const collection of CACHED_COLLECTIONS) {
        const rows = fresh[collection === 'pantry' ? 'pantry' : collection] as { id: string }[];
        await store.clearCollection(collection);
        await store.writeMany(collection, rows.map((row) => ({ id: row.id, doc: row })));
      }

      this.publish({
        ...this.snapshot,
        status: 'ready',
        cookbooks: fresh.cookbooks,
        recipes: fresh.recipes,
        pantry: fresh.pantry,
        online: true,
        pendingIds: [],
        error: undefined,
      });
    } catch (error) {
      const offline = error instanceof RemoteError && error.offline;
      this.publish({
        ...this.snapshot,
        // Cached content is still worth showing; it is just not fresh.
        status: this.snapshot.recipes.length > 0 ? 'ready' : 'error',
        online: !offline,
        error: offline ? undefined : error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** Send anything queued while offline. Safe to call often. */
  flush = async (): Promise<outbox.DrainResult | undefined> => {
    const store = this.store;
    if (!store) return undefined;

    const result = await outbox.drain(store, (op, value) => this.applyConfirmed(op, value));
    this.publish({
      ...this.snapshot,
      pending: result.remaining,
      online: result.remaining === 0,
      error: result.rejected.length > 0 ? result.rejected[0].reason : this.snapshot.error,
    });
    return result;
  };

  /** Replace an optimistic value with the row the server actually stored. */
  private async applyConfirmed(op: PendingOp, value: unknown): Promise<void> {
    if (op.kind === 'recipe.save') {
      await this.cacheRecipe(value as Recipe, op.recipe.id);
    } else {
      await this.cachePantryItem(value as PantryItem);
    }
  }

  private publish(next: LibrarySnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private markPending(id: string, pending: boolean): string[] {
    const current = this.snapshot.pendingIds;
    if (pending) return current.includes(id) ? current : [...current, id];
    return current.filter((x) => x !== id);
  }

  // -- recipes --------------------------------------------------------------

  getRecipe = (id: ID): Recipe | undefined => this.snapshot.recipes.find((r) => r.id === id);

  /**
   * Save to the server and keep what it returns.
   *
   * The optimistic value is shown first so the UI never waits, but it is
   * replaced by the stored row — including the `updated_at` the server's
   * trigger sets, which is the value every device reconciles by.
   */
  saveRecipe = async (recipe: Recipe): Promise<Recipe> => {
    const optimistic: Recipe = { ...recipe, updatedAt: nowISO() };
    this.publish({
      ...this.snapshot,
      recipes: upsert(this.snapshot.recipes, optimistic),
      pendingIds: this.markPending(optimistic.id, true),
    });

    try {
      const stored = await remote.saveRecipe(optimistic);
      await this.cacheRecipe(stored, optimistic.id);
      return stored;
    } catch (error) {
      return (await this.queueOrFail(error, { kind: 'recipe.save', recipe: optimistic }, optimistic)) as Recipe;
    }
  };

  private async cacheRecipe(stored: Recipe, optimisticId: string): Promise<void> {
    await this.store?.write('recipes', stored.id, stored);
    if (stored.id !== optimisticId) await this.store?.hardDelete('recipes', optimisticId);

    this.publish({
      ...this.snapshot,
      recipes: upsert(
        this.snapshot.recipes.filter((r) => r.id === stored.id || r.id !== optimisticId),
        stored,
      ),
      online: true,
      pendingIds: this.markPending(optimisticId, false),
    });
  }

  /**
   * Soft delete. The tombstone is what lets a delete on one phone reach the
   * rest of the family instead of the recipe reappearing at the next refresh.
   */
  deleteRecipe = async (id: ID): Promise<void> => {
    const existing = this.getRecipe(id);
    if (!existing) return;
    await this.saveRecipe({ ...existing, deletedAt: nowISO() });
  };

  restoreRecipe = async (id: ID): Promise<void> => {
    const existing = this.getRecipe(id);
    if (!existing) return;
    const { deletedAt: _removed, ...rest } = existing;
    await this.saveRecipe(rest as Recipe);
  };

  /** Bump the cooked counter — powers "what we actually make". */
  markCooked = async (id: ID): Promise<void> => {
    const existing = this.getRecipe(id);
    if (!existing) return;
    await this.saveRecipe({
      ...existing,
      timesCooked: (existing.timesCooked ?? 0) + 1,
      lastCookedAt: nowISO(),
    });
  };

  // -- cookbooks ------------------------------------------------------------

  saveCookbook = async (cookbook: Cookbook): Promise<Cookbook> => {
    const optimistic: Cookbook = { ...cookbook, updatedAt: nowISO() };
    this.publish({ ...this.snapshot, cookbooks: upsert(this.snapshot.cookbooks, optimistic) });

    const stored = await remote.saveCookbook(optimistic);
    await this.store?.write('cookbooks', stored.id, stored);
    this.publish({ ...this.snapshot, cookbooks: upsert(this.snapshot.cookbooks, stored) });
    return stored;
  };

  createCookbook = (name: string, description?: string): Promise<Cookbook> =>
    this.saveCookbook({
      id: newId(),
      name,
      description,
      ownerId: this.userId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    });

  /** The cookbook new recipes go into when the cook has not chosen one. */
  defaultCookbookId = (): ID | undefined =>
    this.snapshot.cookbooks.find((c) => !c.deletedAt)?.id;

  // -- pantry ---------------------------------------------------------------

  /**
   * Add by name and let the database decide whether that is a new row.
   *
   * "One row per food per person" is a property of the data, not of whichever
   * phone typed it, so the decision belongs on the server — two devices adding
   * "eggs" must not become two rows.
   */
  addPantryItem = async (name: string, staple = false): Promise<PantryItem | undefined> => {
    const clean = name.trim();
    if (!clean) return undefined;

    const existing = this.snapshot.pantry.find(
      (p) => !p.deletedAt && p.name.toLowerCase() === clean.toLowerCase(),
    );
    if (existing) return existing;

    const optimistic: PantryItem = { id: newId(), name: clean, staple, updatedAt: nowISO() };
    this.publish({
      ...this.snapshot,
      pantry: [...this.snapshot.pantry, optimistic],
      pendingIds: this.markPending(optimistic.id, true),
    });

    try {
      const stored = await remote.addPantryItem(clean, staple);
      await this.cachePantryItem(stored, optimistic.id);
      return stored;
    } catch (error) {
      return (await this.queueOrFail(
        error,
        { kind: 'pantry.add', name: clean, staple },
        optimistic,
      )) as PantryItem;
    }
  };

  private async cachePantryItem(stored: PantryItem, optimisticId?: string): Promise<void> {
    await this.store?.write('pantry', stored.id, stored);
    if (optimisticId && optimisticId !== stored.id) {
      await this.store?.hardDelete('pantry', optimisticId);
    }

    const withoutOptimistic = optimisticId
      ? this.snapshot.pantry.filter((p) => p.id !== optimisticId || p.id === stored.id)
      : this.snapshot.pantry;

    this.publish({
      ...this.snapshot,
      pantry: upsert(withoutOptimistic, stored),
      online: true,
      pendingIds: optimisticId ? this.markPending(optimisticId, false) : this.snapshot.pendingIds,
    });
  }

  removePantryItem = async (id: ID): Promise<void> => {
    const existing = this.snapshot.pantry.find((p) => p.id === id);
    if (!existing) return;

    const optimistic = { ...existing, deletedAt: nowISO() };
    this.publish({ ...this.snapshot, pantry: upsert(this.snapshot.pantry, optimistic) });

    try {
      await this.cachePantryItem(await remote.removePantryItem(id));
    } catch (error) {
      await this.queueOrFail(error, { kind: 'pantry.remove', itemId: id }, optimistic);
    }
  };

  // -- offline --------------------------------------------------------------

  /**
   * A failed write is either the network or the server. The network is worth
   * queueing for; a refusal is not, so it surfaces straight away.
   */
  private async queueOrFail(
    error: unknown,
    op: PendingOpInput,
    optimistic: unknown,
  ): Promise<unknown> {
    if (!(error instanceof RemoteError) || !error.offline || !this.store) throw error;

    await outbox.enqueue(this.store, op);
    this.publish({
      ...this.snapshot,
      online: false,
      pending: await outbox.queueLength(this.store),
    });
    return optimistic;
  }

  // -- realtime -------------------------------------------------------------

  /** Apply one row pushed by the server. */
  applyRealtimeRow = async (collection: Collection, row: Recipe | Cookbook | PantryItem): Promise<void> => {
    // A row we are still waiting on would otherwise flicker back to its old value.
    if (this.snapshot.pendingIds.includes(row.id)) return;

    await this.store?.write(collection, row.id, row);
    if (collection === 'recipes') {
      this.publish({ ...this.snapshot, recipes: upsert(this.snapshot.recipes, row as Recipe) });
    } else if (collection === 'cookbooks') {
      this.publish({ ...this.snapshot, cookbooks: upsert(this.snapshot.cookbooks, row as Cookbook) });
    } else {
      this.publish({ ...this.snapshot, pantry: upsert(this.snapshot.pantry, row as PantryItem) });
    }
  };

  getStoreForTesting = (): DocumentStore | undefined => this.store;

  /** Test seam: start from a clean slate without reloading the module. */
  resetForTesting = (): void => {
    this.snapshot = EMPTY;
    this.store = undefined;
    this.userId = undefined;
    this.loading = undefined;
    this.listeners.clear();
  };
}

function upsert<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];
  const copy = items.slice();
  copy[index] = next;
  return copy;
}

export const library = new Library();
