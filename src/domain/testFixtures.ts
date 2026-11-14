import type { PantryItem, Recipe } from './types';
import { parseIngredientLines } from './parseIngredient';
import { buildSteps } from './recipe';

let counter = 0;
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString();

/** Build a recipe for tests without repeating boilerplate at every call site. */
export function makeRecipe(overrides: Partial<Recipe> & { title: string }): Recipe {
  const n = counter++;
  const defaults = overrides.ingredients
    ? undefined
    : ['2 cups all-purpose flour', '1 tsp salt', '3 large eggs'];

  return {
    id: `recipe-${n}`,
    cookbookId: 'cookbook-1',
    servings: 4,
    ingredients: defaults ? parseIngredientLines(defaults) : [],
    steps: buildSteps(['Mix everything.', 'Bake for 25 minutes.']),
    tags: [],
    createdAt: stamp(n),
    updatedAt: stamp(n),
    ...overrides,
  };
}

export function recipeWithIngredients(
  title: string,
  lines: string[],
  overrides: Partial<Recipe> = {},
): Recipe {
  return makeRecipe({ title, ingredients: parseIngredientLines(lines), ...overrides });
}

export function makePantry(names: string[]): PantryItem[] {
  return names.map((name, i) => ({ id: `pantry-${i}`, name, updatedAt: stamp(i) }));
}
