import type { Ingredient, PantryItem, Recipe } from './types';

/**
 * Words that describe a food without changing what it is. Stripped before
 * matching so "3 large free-range eggs" and "eggs" are the same thing.
 */
const DESCRIPTORS = new Set([
  'large', 'small', 'medium', 'extra', 'jumbo', 'fresh', 'freshly', 'frozen',
  'organic', 'free-range', 'ripe', 'unripe', 'raw', 'cold', 'warm', 'hot',
  'room', 'temperature', 'good', 'quality', 'best', 'plain', 'pure', 'natural',
  'unsalted', 'salted', 'lowfat', 'low-fat', 'nonfat', 'fat-free', 'reduced',
  'sodium', 'boneless', 'skinless', 'peeled', 'chopped', 'minced', 'diced',
  'sliced', 'grated', 'shredded', 'crushed', 'halved', 'quartered', 'cubed',
  'melted', 'softened', 'beaten', 'drained', 'rinsed', 'cooked', 'uncooked',
  'a', 'an', 'the', 'of', 'or', 'and', 'for', 'to', 'taste', 'optional',
  'about', 'approximately', 'your', 'favorite', 'favourite', 'any',
]);

/** Different names for the same thing, folded onto one canonical name. */
const SYNONYMS: Record<string, string> = {
  scallion: 'green onion',
  scallions: 'green onion',
  'spring onion': 'green onion',
  'coriander leaves': 'cilantro',
  aubergine: 'eggplant',
  courgette: 'zucchini',
  capsicum: 'bell pepper',
  'garbanzo bean': 'chickpea',
  'garbanzo beans': 'chickpea',
  'caster sugar': 'sugar',
  'granulated sugar': 'sugar',
  'confectioners sugar': 'powdered sugar',
  'icing sugar': 'powdered sugar',
  'plain flour': 'all-purpose flour',
  'ap flour': 'all-purpose flour',
  'bicarbonate of soda': 'baking soda',
  'double cream': 'heavy cream',
  'heavy whipping cream': 'heavy cream',
  stock: 'broth',
  'corn flour': 'cornstarch',
  'groundnut oil': 'peanut oil',
};

/**
 * Ingredients almost every kitchen has. They never count as missing unless the
 * cook says otherwise, so "what can I make" stays useful.
 */
export const DEFAULT_STAPLES = [
  'water', 'salt', 'pepper', 'black pepper', 'olive oil', 'vegetable oil',
  'cooking spray', 'sugar', 'all-purpose flour', 'butter', 'ice',
];

function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses') || word.endsWith('shes') || word.endsWith('ches')) return word.slice(0, -2);
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/**
 * Reduce a food name to a comparable form: lowercased, de-pluralised, stripped
 * of descriptors, with known synonyms folded together.
 */
export function normalizeFoodName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const direct = SYNONYMS[base];
  if (direct) return direct;

  const tokens = base
    .split(' ')
    .map(singularize)
    .filter((w) => w && !DESCRIPTORS.has(w));

  // The whole name was descriptors ("fresh"); fall back to the raw form.
  if (tokens.length === 0) return base;

  const rebuilt = tokens.join(' ');
  return SYNONYMS[rebuilt] ?? rebuilt;
}

function tokensOf(name: string): string[] {
  return normalizeFoodName(name).split(/[\s-]+/).filter(Boolean);
}

/**
 * Whether a pantry entry satisfies a recipe ingredient.
 *
 * Names match when one is a more specific version of the other *and* they share
 * a head noun — so "flour" covers "all-purpose flour", but "chicken" does not
 * quietly cover "chicken broth".
 */
export function foodNamesMatch(pantryName: string, ingredientName: string): boolean {
  const a = tokensOf(pantryName);
  const b = tokensOf(ingredientName);
  if (a.length === 0 || b.length === 0) return false;

  if (a.join(' ') === b.join(' ')) return true;
  if (a[a.length - 1] !== b[b.length - 1]) return false;

  const aSet = new Set(a);
  const bSet = new Set(b);
  return a.every((t) => bSet.has(t)) || b.every((t) => aSet.has(t));
}

export interface PantryMatch {
  recipe: Recipe;
  /** Non-optional ingredients the cook has (or that are staples). */
  have: Ingredient[];
  missing: Ingredient[];
  /** Optional ingredients not on hand. Never blocks cooking. */
  missingOptional: Ingredient[];
  /** 0–1 share of required ingredients on hand. 1 means "make it tonight". */
  coverage: number;
}

export interface PantryMatchOptions {
  /** Extra names treated as always available, on top of each item's `staple` flag. */
  staples?: string[];
  /** Treat the default staple list as on hand. Defaults to true. */
  includeDefaultStaples?: boolean;
}

export function matchRecipeToPantry(
  recipe: Recipe,
  pantry: PantryItem[],
  options: PantryMatchOptions = {},
): PantryMatch {
  const { includeDefaultStaples = true, staples = [] } = options;

  const availableNames = [
    ...pantry.filter((p) => !p.deletedAt).map((p) => p.name),
    ...staples,
    ...(includeDefaultStaples ? DEFAULT_STAPLES : []),
  ];

  const have: Ingredient[] = [];
  const missing: Ingredient[] = [];
  const missingOptional: Ingredient[] = [];

  for (const ingredient of recipe.ingredients) {
    const onHand = availableNames.some((name) => foodNamesMatch(name, ingredient.item));
    if (onHand) have.push(ingredient);
    else if (ingredient.optional) missingOptional.push(ingredient);
    else missing.push(ingredient);
  }

  const required = have.length + missing.length;
  const coverage = required === 0 ? 1 : have.length / required;
  return { recipe, have, missing, missingOptional, coverage };
}

/**
 * Everything you would need to buy to cook these recipes.
 *
 * Entries are merged when they name the same food, keeping the more specific
 * wording — you should not end up buying "flour" and "all-purpose flour".
 */
export function buildShoppingList(matches: PantryMatch[]): Ingredient[] {
  const out: Ingredient[] = [];

  for (const match of matches) {
    for (const ingredient of match.missing) {
      const existingIndex = out.findIndex((i) => foodNamesMatch(i.item, ingredient.item));
      if (existingIndex === -1) {
        out.push(ingredient);
        continue;
      }
      const existing = out[existingIndex];
      if (normalizeFoodName(ingredient.item).length > normalizeFoodName(existing.item).length) {
        out[existingIndex] = ingredient;
      }
    }
  }
  return out;
}
