import { describe, expect, it } from 'vitest';
import { buildShoppingList, foodNamesMatch, matchRecipeToPantry, normalizeFoodName } from './pantry';
import { makePantry, recipeWithIngredients } from './testFixtures';

describe('normalizeFoodName', () => {
  it('lowercases, de-pluralises and drops descriptors', () => {
    expect(normalizeFoodName('3 Large Free-Range Eggs')).toBe('egg');
    expect(normalizeFoodName('Fresh Tomatoes')).toBe('tomato');
    expect(normalizeFoodName('boneless skinless chicken thighs')).toBe('chicken thigh');
  });

  it('folds known synonyms together', () => {
    expect(normalizeFoodName('scallions')).toBe('green onion');
    expect(normalizeFoodName('plain flour')).toBe('all-purpose flour');
    expect(normalizeFoodName('courgette')).toBe('zucchini');
  });

  it('survives a name made entirely of descriptors', () => {
    expect(normalizeFoodName('fresh')).toBe('fresh');
  });
});

describe('foodNamesMatch', () => {
  it('matches a general pantry item to a specific ingredient', () => {
    expect(foodNamesMatch('flour', 'all-purpose flour')).toBe(true);
    expect(foodNamesMatch('all-purpose flour', 'flour')).toBe(true);
  });

  it('matches across plurals and descriptors', () => {
    expect(foodNamesMatch('egg', '3 large eggs')).toBe(true);
    expect(foodNamesMatch('tomatoes', 'ripe tomato')).toBe(true);
  });

  it('does not match different foods that merely share a word', () => {
    expect(foodNamesMatch('chicken', 'chicken broth')).toBe(false);
    expect(foodNamesMatch('olive oil', 'olive')).toBe(false);
    expect(foodNamesMatch('sugar', 'brown sugar')).toBe(true);
  });
});

describe('matchRecipeToPantry', () => {
  const recipe = recipeWithIngredients('Pasta', [
    '400 g spaghetti',
    '2 cloves garlic, minced',
    '1/4 cup olive oil',
    'Salt to taste',
    '2 tbsp chopped parsley (optional)',
  ]);

  it('counts staples as on hand', () => {
    const match = matchRecipeToPantry(recipe, makePantry(['spaghetti', 'garlic']));
    expect(match.missing).toHaveLength(0);
    expect(match.coverage).toBe(1);
  });

  it('reports what is missing', () => {
    const match = matchRecipeToPantry(recipe, makePantry(['spaghetti']));
    expect(match.missing.map((i) => i.item)).toEqual(['garlic']);
    expect(match.coverage).toBeCloseTo(3 / 4);
  });

  it('keeps optional ingredients out of the missing count', () => {
    const match = matchRecipeToPantry(recipe, makePantry(['spaghetti', 'garlic']));
    expect(match.missingOptional.map((i) => i.item)).toEqual(['chopped parsley']);
    expect(match.coverage).toBe(1);
  });

  it('can be told not to assume staples', () => {
    const match = matchRecipeToPantry(recipe, makePantry(['spaghetti', 'garlic']), {
      includeDefaultStaples: false,
    });
    expect(match.missing.map((i) => i.item)).toEqual(['olive oil', 'Salt']);
  });

  it('ignores deleted pantry items', () => {
    const pantry = makePantry(['spaghetti', 'garlic']);
    pantry[1].deletedAt = new Date().toISOString();
    expect(matchRecipeToPantry(recipe, pantry).missing.map((i) => i.item)).toEqual(['garlic']);
  });
});

describe('buildShoppingList', () => {
  it('merges entries naming the same food, keeping the specific wording', () => {
    const a = recipeWithIngredients('A', ['2 cups flour', '1 cup milk']);
    const b = recipeWithIngredients('B', ['3 cups all-purpose flour', '2 eggs']);
    const pantry = makePantry([]);
    const list = buildShoppingList([
      matchRecipeToPantry(a, pantry, { includeDefaultStaples: false }),
      matchRecipeToPantry(b, pantry, { includeDefaultStaples: false }),
    ]);
    expect(list.map((i) => i.item).sort()).toEqual(['all-purpose flour', 'eggs', 'milk']);
  });
});
