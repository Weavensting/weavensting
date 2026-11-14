import type { PantryItem, Recipe } from './types';
import { matchRecipeToPantry, type PantryMatch, type PantryMatchOptions } from './pantry';
import { totalMinutes } from './recipe';

export interface MacroFilters {
  maxCalories?: number;
  minCalories?: number;
  minProteinG?: number;
  maxCarbsG?: number;
  maxFatG?: number;
}

export interface SearchFilters extends MacroFilters {
  /** Free text, matched against title, tags, ingredients and steps. */
  query?: string;
  tags?: string[];
  cookbookIds?: string[];
  maxTotalMinutes?: number;
  /** Keep only recipes missing at most this many required ingredients. */
  maxMissingIngredients?: number;
  /** Exclude recipes with no nutrition data when macro filters are set. */
  requireNutrition?: boolean;
  sort?: 'relevance' | 'recent' | 'title' | 'pantry' | 'quickest';
}

export interface SearchResult {
  recipe: Recipe;
  score: number;
  pantry?: PantryMatch;
}

export interface SearchContext {
  pantry?: PantryItem[];
  pantryOptions?: PantryMatchOptions;
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/**
 * Relevance is weighted by where a term appears: a recipe called "Chicken Pie"
 * should beat one that merely simmers a cup of chicken broth in step 4.
 */
function textScore(recipe: Recipe, terms: string[]): number {
  if (terms.length === 0) return 0;

  const title = normalize(recipe.title);
  const tags = normalize(recipe.tags.join(' '));
  const ingredients = normalize(recipe.ingredients.map((i) => `${i.item} ${i.raw}`).join(' '));
  const meta = normalize(
    [recipe.description, recipe.notes, recipe.source?.familyAttribution, recipe.source?.author]
      .filter(Boolean)
      .join(' '),
  );
  const steps = normalize(recipe.steps.map((s) => s.text).join(' '));

  let score = 0;
  for (const term of terms) {
    let termScore = 0;
    if (title === term) termScore += 60;
    else if (title.startsWith(term)) termScore += 30;
    else if (title.includes(term)) termScore += 20;
    if (tags.includes(term)) termScore += 12;
    if (ingredients.includes(term)) termScore += 8;
    if (meta.includes(term)) termScore += 5;
    if (steps.includes(term)) termScore += 2;

    // Every term must land somewhere, or the recipe is not a result at all.
    if (termScore === 0) return -1;
    score += termScore;
  }
  return score;
}

function passesMacros(recipe: Recipe, filters: SearchFilters): boolean {
  const hasMacroFilter =
    filters.maxCalories !== undefined ||
    filters.minCalories !== undefined ||
    filters.minProteinG !== undefined ||
    filters.maxCarbsG !== undefined ||
    filters.maxFatG !== undefined;
  if (!hasMacroFilter) return true;

  const n = recipe.nutrition;
  if (!n) return !filters.requireNutrition;

  if (filters.maxCalories !== undefined && (n.calories ?? Infinity) > filters.maxCalories) return false;
  if (filters.minCalories !== undefined && (n.calories ?? -Infinity) < filters.minCalories) return false;
  if (filters.minProteinG !== undefined && (n.proteinG ?? -Infinity) < filters.minProteinG) return false;
  if (filters.maxCarbsG !== undefined && (n.carbsG ?? Infinity) > filters.maxCarbsG) return false;
  if (filters.maxFatG !== undefined && (n.fatG ?? Infinity) > filters.maxFatG) return false;
  return true;
}

export function searchRecipes(
  recipes: Recipe[],
  filters: SearchFilters = {},
  context: SearchContext = {},
): SearchResult[] {
  const terms = normalize(filters.query ?? '')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const wantedTags = (filters.tags ?? []).map((t) => t.toLowerCase());
  const usePantry = filters.maxMissingIngredients !== undefined || filters.sort === 'pantry';
  const results: SearchResult[] = [];

  for (const recipe of recipes) {
    if (recipe.deletedAt) continue;
    if (filters.cookbookIds && !filters.cookbookIds.includes(recipe.cookbookId)) continue;
    if (wantedTags.length > 0 && !wantedTags.every((t) => recipe.tags.includes(t))) continue;

    if (filters.maxTotalMinutes !== undefined) {
      const time = totalMinutes(recipe);
      if (time === undefined || time > filters.maxTotalMinutes) continue;
    }
    if (!passesMacros(recipe, filters)) continue;

    const relevance = textScore(recipe, terms);
    if (relevance < 0) continue;

    let pantry: PantryMatch | undefined;
    if (usePantry && context.pantry) {
      pantry = matchRecipeToPantry(recipe, context.pantry, context.pantryOptions);
      if (
        filters.maxMissingIngredients !== undefined &&
        pantry.missing.length > filters.maxMissingIngredients
      ) {
        continue;
      }
    }

    results.push({ recipe, score: relevance + (pantry ? pantry.coverage * 15 : 0), pantry });
  }

  return sortResults(results, filters.sort ?? (terms.length > 0 ? 'relevance' : 'recent'));
}

function sortResults(results: SearchResult[], sort: NonNullable<SearchFilters['sort']>): SearchResult[] {
  const byTitle = (a: SearchResult, b: SearchResult) => a.recipe.title.localeCompare(b.recipe.title);

  switch (sort) {
    case 'title':
      return results.sort(byTitle);
    case 'recent':
      return results.sort(
        (a, b) => Date.parse(b.recipe.updatedAt) - Date.parse(a.recipe.updatedAt) || byTitle(a, b),
      );
    case 'quickest':
      return results.sort(
        (a, b) => (totalMinutes(a.recipe) ?? Infinity) - (totalMinutes(b.recipe) ?? Infinity) || byTitle(a, b),
      );
    case 'pantry':
      return results.sort(
        (a, b) =>
          (b.pantry?.coverage ?? 0) - (a.pantry?.coverage ?? 0) ||
          (a.pantry?.missing.length ?? 0) - (b.pantry?.missing.length ?? 0) ||
          byTitle(a, b),
      );
    case 'relevance':
    default:
      return results.sort((a, b) => b.score - a.score || byTitle(a, b));
  }
}

/** Every tag in use, most common first — drives the filter chips. */
export function collectTags(recipes: Recipe[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    if (recipe.deletedAt) continue;
    for (const tag of recipe.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
