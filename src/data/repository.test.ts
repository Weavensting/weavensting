import { beforeEach, describe, expect, it } from 'vitest';
import { library } from './repository';
import { __setStoreForTesting, createMemoryStore } from './store';
import { makeRecipe } from '../domain/testFixtures';

async function freshLibrary() {
  const store = createMemoryStore();
  library.resetForTesting();
  __setStoreForTesting(store);
  await library.load();
  return store;
}

describe('library', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('seeds a starter cookbook on first run', () => {
    const snapshot = library.getSnapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.cookbooks).toHaveLength(1);
    expect(snapshot.recipes.length).toBeGreaterThan(0);
    expect(snapshot.recipes[0].ingredients[0].raw).toBeTruthy();
  });

  it('notifies subscribers on every write', async () => {
    let calls = 0;
    const unsubscribe = library.subscribe(() => {
      calls += 1;
    });

    await library.saveRecipe(makeRecipe({ title: 'New Thing' }));
    expect(calls).toBe(1);

    unsubscribe();
    await library.saveRecipe(makeRecipe({ title: 'Another' }));
    expect(calls).toBe(1);
  });

  it('gives a new snapshot object so React re-renders', async () => {
    const before = library.getSnapshot();
    await library.saveRecipe(makeRecipe({ title: 'Changed' }));
    expect(library.getSnapshot()).not.toBe(before);
  });

  it('updates in place rather than duplicating', async () => {
    const recipe = await library.saveRecipe(makeRecipe({ title: 'Pie' }));
    const count = library.getSnapshot().recipes.length;
    await library.saveRecipe({ ...recipe, title: 'Better Pie' });

    expect(library.getSnapshot().recipes).toHaveLength(count);
    expect(library.getRecipe(recipe.id)?.title).toBe('Better Pie');
  });

  it('soft deletes so the removal can sync', async () => {
    const recipe = await library.saveRecipe(makeRecipe({ title: 'Doomed' }));
    await library.deleteRecipe(recipe.id);
    expect(library.getRecipe(recipe.id)?.deletedAt).toBeTruthy();

    await library.restoreRecipe(recipe.id);
    expect(library.getRecipe(recipe.id)?.deletedAt).toBeUndefined();
  });

  it('counts how often a recipe gets cooked', async () => {
    const recipe = await library.saveRecipe(makeRecipe({ title: 'Favourite' }));
    await library.markCooked(recipe.id);
    await library.markCooked(recipe.id);

    expect(library.getRecipe(recipe.id)?.timesCooked).toBe(2);
    expect(library.getRecipe(recipe.id)?.lastCookedAt).toBeTruthy();
  });

  it('does not add the same pantry item twice', async () => {
    await library.addPantryItem('Flour');
    await library.addPantryItem('flour');
    await library.addPantryItem('  ');
    expect(library.getSnapshot().pantry).toHaveLength(1);
  });

  it('persists writes so a reload sees them', async () => {
    const store = await freshLibrary();
    await library.saveRecipe(makeRecipe({ title: 'Survivor' }));

    library.resetForTesting();
    __setStoreForTesting(store);
    await library.load();

    expect(library.getSnapshot().recipes.some((r) => r.title === 'Survivor')).toBe(true);
  });

  it('marks local writes dirty for the sync layer', async () => {
    const store = await freshLibrary();
    // Seeded content came from the server side of the world; not a local edit.
    expect(await store.readDirty()).toHaveLength(0);

    await library.saveRecipe(makeRecipe({ title: 'Mine' }));
    const dirty = await store.readDirty();
    expect(dirty).toHaveLength(1);
    expect((dirty[0].doc as { title: string }).title).toBe('Mine');
  });
});

describe('claimLocalDataFor', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('gives recipes made before signing in to the new account', async () => {
    const before = await library.saveRecipe(
      makeRecipe({ title: 'Made while signed out', cookbookId: 'seed-cookbook' }),
    );
    expect(before.createdBy).toBeUndefined();

    const claimed = await library.claimLocalDataFor('user-1');

    expect(claimed).toBe(1);
    expect(library.getSnapshot().cookbooks[0].ownerId).toBe('user-1');
    expect(library.getRecipe(before.id)?.createdBy).toBe('user-1');
  });

  it('leaves someone else’s data alone', async () => {
    await library.saveCookbook({
      id: 'theirs', name: 'Their Book', ownerId: 'user-2',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const theirRecipe = await library.saveRecipe(
      makeRecipe({ title: 'Theirs', cookbookId: 'theirs', createdBy: 'user-2' }),
    );

    await library.claimLocalDataFor('user-1');

    expect(library.getSnapshot().cookbooks.find((c) => c.id === 'theirs')?.ownerId).toBe('user-2');
    expect(library.getRecipe(theirRecipe.id)?.createdBy).toBe('user-2');
  });

  it('is safe to run again on a later sign-in', async () => {
    await library.claimLocalDataFor('user-1');
    expect(await library.claimLocalDataFor('user-1')).toBe(0);
  });
});
