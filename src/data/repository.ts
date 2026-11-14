import type { Cookbook, ID, PantryItem, Recipe } from '../domain/types';
import { newId, nowISO } from '../domain/id';
import { getStore, type Collection, type DocumentStore } from './store';
import { seedCookbook, seedRecipes } from './seed';

export interface LibrarySnapshot {
  status: 'loading' | 'ready' | 'error';
  recipes: Recipe[];
  cookbooks: Cookbook[];
  pantry: PantryItem[];
  error?: string;
}

const EMPTY: LibrarySnapshot = { status: 'loading', recipes: [], cookbooks: [], pantry: [] };

type Listener = () => void;

/**
 * The app's single source of truth.
 *
 * Everything lives in memory and is mirrored to the platform store on write, so
 * reads are synchronous and every screen sees the same data without a round
 * trip. Writes are local-first: they land immediately and are marked for the
 * sync layer to push when a family account is connected.
 */
class Library {
  private snapshot: LibrarySnapshot = EMPTY;
  private listeners = new Set<Listener>();
  private store?: DocumentStore;
  private loading?: Promise<void>;

  getSnapshot = (): LibrarySnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Idempotent: many screens may call this on mount. */
  load = (): Promise<void> => {
    this.loading ??= this.doLoad();
    return this.loading;
  };

  private async doLoad(): Promise<void> {
    try {
      const store = await getStore();
      await store.init();
      this.store = store;

      const [recipes, cookbooks, pantry] = await Promise.all([
        store.readAll('recipes').then((docs) => docs.map((d) => d.doc as Recipe)),
        store.readAll('cookbooks').then((docs) => docs.map((d) => d.doc as Cookbook)),
        store.readAll('pantry').then((docs) => docs.map((d) => d.doc as PantryItem)),
      ]);

      if (cookbooks.length === 0 && recipes.length === 0) {
        // First run: give the cook something to look at rather than an empty screen.
        const seeded = seedRecipes(seedCookbook.id);
        await store.write('cookbooks', seedCookbook.id, seedCookbook, false);
        await store.writeMany('recipes', seeded.map((r) => ({ id: r.id, doc: r })), false);
        this.publish({ status: 'ready', recipes: seeded, cookbooks: [seedCookbook], pantry: [] });
        return;
      }

      this.publish({ status: 'ready', recipes, cookbooks, pantry });
    } catch (error) {
      this.publish({
        ...this.snapshot,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private publish(next: LibrarySnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  private async persist(collection: Collection, id: string, doc: unknown): Promise<void> {
    await this.store?.write(collection, id, doc);
  }

  // -- recipes --------------------------------------------------------------

  getRecipe = (id: ID): Recipe | undefined => this.snapshot.recipes.find((r) => r.id === id);

  saveRecipe = async (recipe: Recipe): Promise<Recipe> => {
    const saved: Recipe = { ...recipe, updatedAt: nowISO() };
    this.publish({ ...this.snapshot, recipes: upsert(this.snapshot.recipes, saved) });
    await this.persist('recipes', saved.id, saved);
    return saved;
  };

  /**
   * Soft delete. The tombstone is what lets a delete on one phone reach the
   * rest of the family instead of the recipe reappearing at the next sync.
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
    const saved: Cookbook = { ...cookbook, updatedAt: nowISO() };
    this.publish({ ...this.snapshot, cookbooks: upsert(this.snapshot.cookbooks, saved) });
    await this.persist('cookbooks', saved.id, saved);
    return saved;
  };

  createCookbook = (name: string, description?: string, ownerId?: ID): Promise<Cookbook> =>
    this.saveCookbook({
      id: newId(), name, description, ownerId, createdAt: nowISO(), updatedAt: nowISO(),
    });

  /** The cookbook new recipes go into when the cook has not chosen one. */
  defaultCookbookId = (): ID =>
    this.snapshot.cookbooks.find((c) => !c.deletedAt)?.id ?? seedCookbook.id;

  /**
   * Give every unowned cookbook to the person who just signed in.
   *
   * Recipes created before signing in are real recipes, not a throwaway demo —
   * they must survive the first sign-in and sync up, rather than being stranded
   * on the device because the server requires an owner.
   */
  claimLocalDataFor = async (userId: ID): Promise<number> => {
    const unowned = this.snapshot.cookbooks.filter((c) => !c.deletedAt && !c.ownerId);
    for (const cookbook of unowned) {
      await this.saveCookbook({ ...cookbook, ownerId: userId });
    }

    const claimedIds = new Set(unowned.map((c) => c.id));
    const orphanRecipes = this.snapshot.recipes.filter(
      (r) => !r.createdBy && claimedIds.has(r.cookbookId),
    );
    for (const recipe of orphanRecipes) {
      await this.saveRecipe({ ...recipe, createdBy: userId });
    }
    return unowned.length;
  };

  // -- pantry ---------------------------------------------------------------

  addPantryItem = async (name: string, staple = false): Promise<PantryItem | undefined> => {
    const clean = name.trim();
    if (!clean) return undefined;

    // Adding something already on the list should not create a duplicate row.
    const existing = this.snapshot.pantry.find(
      (p) => !p.deletedAt && p.name.toLowerCase() === clean.toLowerCase(),
    );
    if (existing) return existing;

    const item: PantryItem = { id: newId(), name: clean, staple, updatedAt: nowISO() };
    this.publish({ ...this.snapshot, pantry: [...this.snapshot.pantry, item] });
    await this.persist('pantry', item.id, item);
    return item;
  };

  savePantryItem = async (item: PantryItem): Promise<void> => {
    const saved = { ...item, updatedAt: nowISO() };
    this.publish({ ...this.snapshot, pantry: upsert(this.snapshot.pantry, saved) });
    await this.persist('pantry', saved.id, saved);
  };

  removePantryItem = async (id: ID): Promise<void> => {
    const existing = this.snapshot.pantry.find((p) => p.id === id);
    if (!existing) return;
    await this.savePantryItem({ ...existing, deletedAt: nowISO() });
  };

  // -- sync support ---------------------------------------------------------

  /** Merge documents pulled from the server into local state. */
  applyRemote = async (collection: Collection, docs: unknown[]): Promise<void> => {
    if (docs.length === 0) return;
    await this.store?.writeMany(
      collection,
      docs.map((doc) => ({ id: (doc as { id: string }).id, doc })),
      false,
    );

    const merge = <T extends { id: string }>(current: T[]) =>
      (docs as T[]).reduce((acc, doc) => upsert(acc, doc), current);

    if (collection === 'recipes') this.publish({ ...this.snapshot, recipes: merge(this.snapshot.recipes) });
    else if (collection === 'cookbooks') this.publish({ ...this.snapshot, cookbooks: merge(this.snapshot.cookbooks) });
    else this.publish({ ...this.snapshot, pantry: merge(this.snapshot.pantry) });
  };

  getStoreForSync = (): DocumentStore | undefined => this.store;

  /** Test seam: start from a clean slate without reloading the module. */
  resetForTesting = (): void => {
    this.snapshot = EMPTY;
    this.store = undefined;
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
