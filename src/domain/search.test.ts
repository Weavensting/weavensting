import { describe, expect, it } from 'vitest';
import { collectTags, searchRecipes } from './search';
import { makePantry, makeRecipe, recipeWithIngredients } from './testFixtures';

const chickenPie = recipeWithIngredients(
  'Chicken Pot Pie',
  ['1 lb chicken thighs', '2 cups chicken broth', '1 sheet puff pastry'],
  {
    tags: ['dinner', 'comfort'],
    prepMinutes: 20,
    cookMinutes: 40,
    nutrition: { calories: 620, proteinG: 34, carbsG: 45, fatG: 32 },
  },
);

const salad = recipeWithIngredients(
  'Tomato Salad',
  ['4 ripe tomatoes', '1/4 cup olive oil', '1 tbsp red wine vinegar'],
  {
    tags: ['lunch', 'quick'],
    prepMinutes: 10,
    cookMinutes: 0,
    nutrition: { calories: 180, proteinG: 3, carbsG: 12, fatG: 14 },
  },
);

const stew = recipeWithIngredients('Beef Stew', ['2 lb beef chuck', '3 carrots', '2 cups beef broth'], {
  tags: ['dinner'],
  prepMinutes: 30,
  cookMinutes: 150,
});

const all = [chickenPie, salad, stew];

describe('searchRecipes', () => {
  it('returns everything when there are no filters', () => {
    expect(searchRecipes(all)).toHaveLength(3);
  });

  it('ranks a title match above an ingredient match', () => {
    expect(searchRecipes(all, { query: 'chicken' })[0].recipe.title).toBe('Chicken Pot Pie');
  });

  it('requires every term to match somewhere', () => {
    expect(searchRecipes(all, { query: 'chicken unicorn' })).toHaveLength(0);
    expect(searchRecipes(all, { query: 'beef broth' })).toHaveLength(1);
  });

  it('searches ingredients, not just titles', () => {
    expect(searchRecipes(all, { query: 'puff pastry' }).map((r) => r.recipe.title)).toEqual([
      'Chicken Pot Pie',
    ]);
  });

  it('filters by tag', () => {
    expect(searchRecipes(all, { tags: ['dinner'] }).map((r) => r.recipe.title).sort()).toEqual([
      'Beef Stew',
      'Chicken Pot Pie',
    ]);
  });

  it('filters by total time', () => {
    expect(searchRecipes(all, { maxTotalMinutes: 60 }).map((r) => r.recipe.title).sort()).toEqual([
      'Chicken Pot Pie',
      'Tomato Salad',
    ]);
  });

  it('filters by macros', () => {
    expect(
      searchRecipes(all, { maxCalories: 400, requireNutrition: true }).map((r) => r.recipe.title),
    ).toEqual(['Tomato Salad']);
    expect(
      searchRecipes(all, { minProteinG: 30, requireNutrition: true }).map((r) => r.recipe.title),
    ).toEqual(['Chicken Pot Pie']);
  });

  it('keeps recipes with unknown macros unless told not to', () => {
    expect(searchRecipes(all, { maxCalories: 700 }).map((r) => r.recipe.title)).toContain('Beef Stew');
    expect(
      searchRecipes(all, { maxCalories: 700, requireNutrition: true }).map((r) => r.recipe.title),
    ).not.toContain('Beef Stew');
  });

  it('finds what you can cook from the pantry', () => {
    const pantry = makePantry(['tomatoes', 'red wine vinegar']);
    expect(
      searchRecipes(all, { maxMissingIngredients: 0 }, { pantry }).map((r) => r.recipe.title),
    ).toEqual(['Tomato Salad']);
  });

  it('can allow a short shopping trip', () => {
    const pantry = makePantry(['chicken thighs', 'chicken broth']);
    const results = searchRecipes(all, { maxMissingIngredients: 1, sort: 'pantry' }, { pantry });
    expect(results[0].recipe.title).toBe('Chicken Pot Pie');
    expect(results[0].pantry?.missing.map((i) => i.item)).toEqual(['puff pastry']);
  });

  it('sorts by the quickest to make', () => {
    expect(searchRecipes(all, { sort: 'quickest' }).map((r) => r.recipe.title)).toEqual([
      'Tomato Salad',
      'Chicken Pot Pie',
      'Beef Stew',
    ]);
  });

  it('hides soft-deleted recipes', () => {
    const deleted = makeRecipe({ title: 'Gone', deletedAt: new Date().toISOString() });
    expect(searchRecipes([...all, deleted], { query: 'gone' })).toHaveLength(0);
  });
});

describe('collectTags', () => {
  it('counts tags, most used first', () => {
    expect(collectTags(all)).toEqual([
      { tag: 'dinner', count: 2 },
      { tag: 'comfort', count: 1 },
      { tag: 'lunch', count: 1 },
      { tag: 'quick', count: 1 },
    ]);
  });
});
