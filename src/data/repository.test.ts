import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookbook, PantryItem, Recipe } from '../domain/types';
import { makeRecipe } from '../domain/testFixtures';

/**
 * The repository is tested against a stand-in server.
 *
 * What matters is the contract, not Supabase: the row the server returns is
 * what gets kept, a write that cannot reach the server is queued rather than
 * lost, and the queue goes out in order when the network comes back.
 */

const server = {
  offline: false,
  recipes: new Map<string, Recipe>(),
  pantry: new Map<string, PantryItem>(),
  cookbooks: new Map<string, Cookbook>(),
  saves: [] as string[],
  reject: undefined as string | undefined,
};

class FakeRemoteError extends Error {
  constructor(message: string, readonly offline: boolean) {
    super(message);
    this.name = 'RemoteError';
  }
}

function guard() {
  if (server.offline) throw new FakeRemoteError('Network request failed', true);
  if (server.reject) throw new FakeRemoteError(server.reject, false);
}

/** The server owns `updated_at`, so the fake stamps it too. */
const stamped = <T extends object>(doc: T): T & { updatedAt: string } => ({
  ...doc,
  updatedAt: new Date(Date.now() + server.saves.length).toISOString(),
});

vi.mock('./remote', () => ({
  RemoteError: FakeRemoteError,
  isOffline: (e: unknown) => e instanceof FakeRemoteError && e.offline,
  fetchEverything: async () => {
    guard();
    return {
      cookbooks: [...server.cookbooks.values()],
      recipes: [...server.recipes.values()],
      pantry: [...server.pantry.values()],
    };
  },
  ensureDefaultCookbook: async () => {
    guard();
    const existing = [...server.cookbooks.values()][0];
    if (existing) return existing;
    const created = stamped({
      id: 'server-cookbook', name: 'Family Cookbook', ownerId: 'user-1',
      createdAt: new Date().toISOString(),
    }) as Cookbook;
    server.cookbooks.set(created.id, created);
    return created;
  },
  saveRecipe: async (recipe: Recipe) => {
    guard();
    server.saves.push(recipe.title);
    const stored = stamped(recipe);
    server.recipes.set(stored.id, stored);
    return stored;
  },
  saveCookbook: async (cookbook: Cookbook) => {
    guard();
    const stored = stamped(cookbook);
    server.cookbooks.set(stored.id, stored);
    return stored;
  },
  addPantryItem: async (name: string, staple: boolean) => {
    guard();
    // The real RPC enforces one row per name; the fake does the same.
    const existing = [...server.pantry.values()].find(
      (p) => !p.deletedAt && p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing;
    const stored = stamped({ id: `server-${name}`, name, staple }) as PantryItem;
    server.pantry.set(stored.id, stored);
    return stored;
  },
  removePantryItem: async (id: string) => {
    guard();
    const existing = server.pantry.get(id);
    const stored = stamped({ ...(existing ?? { id, name: 'gone' }), deletedAt: new Date().toISOString() }) as PantryItem;
    server.pantry.set(id, stored);
    return stored;
  },
}));

const { library } = await import('./repository');
const { __setStoreForTesting, createMemoryStore } = await import('./store');

async function signIn(userId = 'user-1') {
  library.resetForTesting();
  __setStoreForTesting(createMemoryStore());
  await library.start(userId);
}

beforeEach(async () => {
  server.offline = false;
  server.reject = undefined;
  server.recipes.clear();
  server.pantry.clear();
  server.cookbooks.clear();
  server.saves = [];
  await signIn();
});

describe('loading', () => {
  it('opens a cookbook on the server and shows what is there', () => {
    const snapshot = library.getSnapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.cookbooks).toHaveLength(1);
    expect(snapshot.online).toBe(true);
  });

  it('shows the server as the source, not a local seed', async () => {
    server.recipes.set('r1', makeRecipe({ id: 'r1', title: 'From the server' }));
    await library.refresh();
    expect(library.getSnapshot().recipes.map((r) => r.title)).toEqual(['From the server']);
  });

  it('drops a recipe that was deleted on another device', async () => {
    server.recipes.set('r1', makeRecipe({ id: 'r1', title: 'Doomed' }));
    await library.refresh();
    expect(library.getSnapshot().recipes).toHaveLength(1);

    server.recipes.delete('r1');
    await library.refresh();
    expect(library.getSnapshot().recipes).toHaveLength(0);
  });
});

describe('writing', () => {
  it('keeps the row the server returned, not the one it sent', async () => {
    const saved = await library.saveRecipe(makeRecipe({ title: 'Pie', updatedAt: '2000-01-01T00:00:00.000Z' }));
    // The server stamps updated_at; the client's guess must not survive.
    expect(saved.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(library.getRecipe(saved.id)?.updatedAt).toBe(saved.updatedAt);
  });

  it('shows the change immediately, before the server answers', async () => {
    const recipe = makeRecipe({ title: 'Optimistic' });
    const inFlight = library.saveRecipe(recipe);
    expect(library.getSnapshot().recipes.some((r) => r.title === 'Optimistic')).toBe(true);
    expect(library.getSnapshot().pendingIds).toContain(recipe.id);

    await inFlight;
    expect(library.getSnapshot().pendingIds).not.toContain(recipe.id);
  });

  it('updates in place rather than duplicating', async () => {
    const recipe = await library.saveRecipe(makeRecipe({ title: 'Pie' }));
    await library.saveRecipe({ ...recipe, title: 'Better Pie' });

    expect(library.getSnapshot().recipes).toHaveLength(1);
    expect(library.getRecipe(recipe.id)?.title).toBe('Better Pie');
  });

  it('soft deletes so the removal reaches everyone', async () => {
    const recipe = await library.saveRecipe(makeRecipe({ title: 'Doomed' }));
    await library.deleteRecipe(recipe.id);
    expect(server.recipes.get(recipe.id)?.deletedAt).toBeTruthy();
  });

  it('counts how often a recipe gets cooked', async () => {
    const recipe = await library.saveRecipe(makeRecipe({ title: 'Favourite' }));
    await library.markCooked(recipe.id);
    await library.markCooked(recipe.id);
    expect(server.recipes.get(recipe.id)?.timesCooked).toBe(2);
  });

  it('surfaces a refusal instead of silently queueing it', async () => {
    server.reject = 'Row-level security says no';
    await expect(library.saveRecipe(makeRecipe({ title: 'Not allowed' }))).rejects.toThrow(
      'Row-level security says no',
    );
    expect(library.getSnapshot().pending).toBe(0);
  });
});

describe('the pantry is de-duplicated by the server', () => {
  it('two devices adding the same food make one row', async () => {
    await library.addPantryItem('eggs');
    library.resetForTesting();
    __setStoreForTesting(createMemoryStore());
    await library.start('user-1');
    await library.addPantryItem('Eggs');

    expect(server.pantry.size).toBe(1);
    expect(library.getSnapshot().pantry.filter((p) => !p.deletedAt)).toHaveLength(1);
  });

  it('ignores a blank name', async () => {
    expect(await library.addPantryItem('   ')).toBeUndefined();
    expect(server.pantry.size).toBe(0);
  });
});

describe('offline', () => {
  it('queues a write and keeps showing it', async () => {
    server.offline = true;
    const recipe = makeRecipe({ title: 'Written in a basement' });
    await library.saveRecipe(recipe);

    const snapshot = library.getSnapshot();
    expect(snapshot.online).toBe(false);
    expect(snapshot.pending).toBe(1);
    expect(snapshot.recipes.some((r) => r.title === 'Written in a basement')).toBe(true);
    expect(server.recipes.size).toBe(0);
  });

  it('sends the queue when the network comes back', async () => {
    server.offline = true;
    await library.saveRecipe(makeRecipe({ title: 'Queued' }));
    await library.addPantryItem('flour');

    server.offline = false;
    await library.flush();

    expect(server.recipes.size).toBe(1);
    expect(server.pantry.size).toBe(1);
    expect(library.getSnapshot().pending).toBe(0);
    expect(library.getSnapshot().online).toBe(true);
  });

  it('sends queued writes in the order they were made', async () => {
    server.offline = true;
    const recipe = makeRecipe({ title: 'First' });
    await library.saveRecipe(recipe);
    await library.saveRecipe({ ...recipe, title: 'Second' });
    await library.saveRecipe({ ...recipe, title: 'Third' });

    server.offline = false;
    await library.flush();

    expect(server.saves).toEqual(['First', 'Second', 'Third']);
    expect(server.recipes.get(recipe.id)?.title).toBe('Third');
  });

  it('flushes before refreshing, so the server does not overwrite local edits', async () => {
    server.offline = true;
    await library.saveRecipe(makeRecipe({ id: 'r1', title: 'Edited offline' }));

    server.offline = false;
    await library.refresh();

    expect(server.recipes.get('r1')?.title).toBe('Edited offline');
    expect(library.getRecipe('r1')?.title).toBe('Edited offline');
  });

  it('drops a write the server refuses rather than blocking the queue', async () => {
    server.offline = true;
    await library.saveRecipe(makeRecipe({ title: 'Doomed' }));
    await library.saveRecipe(makeRecipe({ title: 'Fine' }));

    server.offline = false;
    server.reject = 'Not allowed';
    const first = await library.flush();
    expect(first?.rejected).toHaveLength(2);
    expect(library.getSnapshot().pending).toBe(0);
  });

  it('keeps showing cached recipes when the server cannot be reached', async () => {
    server.recipes.set('r1', makeRecipe({ id: 'r1', title: 'Cached' }));
    await library.refresh();

    server.offline = true;
    await library.refresh();

    const snapshot = library.getSnapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.online).toBe(false);
    expect(snapshot.recipes.map((r) => r.title)).toEqual(['Cached']);
  });
});

describe('the cache belongs to a session', () => {
  it('is cleared on sign-out', async () => {
    server.recipes.set('r1', makeRecipe({ id: 'r1', title: 'Private' }));
    await library.refresh();
    expect(library.getSnapshot().recipes).toHaveLength(1);

    await library.stop();
    expect(library.getSnapshot().recipes).toHaveLength(0);
    expect(library.getSnapshot().status).toBe('idle');
  });

  it('never shows one account the cache of another', async () => {
    const store = createMemoryStore();
    library.resetForTesting();
    __setStoreForTesting(store);
    server.recipes.set('r1', makeRecipe({ id: 'r1', title: 'Belongs to user 1' }));
    await library.start('user-1');
    expect(library.getSnapshot().recipes).toHaveLength(1);

    // A second person signs in on the same phone while it happens to be offline.
    server.offline = true;
    library.resetForTesting();
    __setStoreForTesting(store);
    await library.start('user-2');

    expect(library.getSnapshot().recipes).toHaveLength(0);
  });
});

describe('realtime', () => {
  it('applies a change made on another device', async () => {
    await library.applyRealtimeRow('recipes', makeRecipe({ id: 'r9', title: 'Added by Mum' }));
    expect(library.getRecipe('r9')?.title).toBe('Added by Mum');
  });

  it('does not clobber a write still in flight', async () => {
    server.offline = true;
    const mine = makeRecipe({ id: 'r9', title: 'Mine, unsent' });
    await library.saveRecipe(mine);

    await library.applyRealtimeRow('recipes', makeRecipe({ id: 'r9', title: 'Stale from the server' }));
    expect(library.getRecipe('r9')?.title).toBe('Mine, unsent');
  });
});
