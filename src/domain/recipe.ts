import type { Ingredient, Nutrition, Recipe, RecipeDraft, Step } from './types';
import { formatQuantity, formatUnit, unitIsSpaced } from './units';
import { parseIngredientLines } from './parseIngredient';
import { newId, nowISO } from './id';

export function totalMinutes(recipe: Pick<Recipe, 'prepMinutes' | 'cookMinutes'>): number | undefined {
  const { prepMinutes, cookMinutes } = recipe;
  if (prepMinutes === undefined && cookMinutes === undefined) return undefined;
  return (prepMinutes ?? 0) + (cookMinutes ?? 0);
}

export function formatMinutes(minutes: number | undefined): string {
  if (minutes === undefined || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** Render a parsed ingredient back to a readable line, honouring scale factors. */
export function formatIngredient(ingredient: Ingredient, factor = 1): string {
  // Without a parsed amount there is nothing to scale — show what was written.
  if (ingredient.quantity === undefined) return ingredient.raw;

  const parts: string[] = [];
  const qty = ingredient.quantity * factor;
  let amount = formatQuantity(qty);
  if (ingredient.quantityMax !== undefined) {
    amount += `–${formatQuantity(ingredient.quantityMax * factor)}`;
  }

  if (ingredient.unit) {
    const label = formatUnit(ingredient.unit, qty);
    parts.push(label && unitIsSpaced(ingredient.unit) ? `${amount} ${label}` : `${amount}${label}`);
  } else {
    parts.push(amount);
  }

  parts.push(ingredient.item);
  let line = parts.filter(Boolean).join(' ').trim();
  if (ingredient.preparation) line += `, ${ingredient.preparation}`;
  if (ingredient.optional) line += ' (optional)';
  return line;
}

export function scaleFactor(recipe: Recipe, targetServings: number): number {
  if (!recipe.servings || recipe.servings <= 0 || targetServings <= 0) return 1;
  return targetServings / recipe.servings;
}

/** Nutrition is stored per serving, so it does not change when scaling. */
export function scaleNutrition(nutrition: Nutrition | undefined, factor: number): Nutrition | undefined {
  if (!nutrition) return undefined;
  const scale = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * factor * 10) / 10);
  return {
    calories: scale(nutrition.calories),
    proteinG: scale(nutrition.proteinG),
    carbsG: scale(nutrition.carbsG),
    fatG: scale(nutrition.fatG),
    fiberG: scale(nutrition.fiberG),
    sugarG: scale(nutrition.sugarG),
    sodiumMg: scale(nutrition.sodiumMg),
    basis: nutrition.basis,
  };
}

const DURATION_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(\d+(?:\.\d+)?)?\s*(second|sec|minute|min|hour|hr)s?\b/gi;

/**
 * Pull a duration out of step text so cook mode can offer a timer. When a step
 * names a range ("bake 20–25 minutes") we take the upper bound, and when it
 * names several we take the longest.
 */
export function extractDurationMinutes(text: string): number | undefined {
  let best: number | undefined;
  for (const match of text.matchAll(DURATION_PATTERN)) {
    const value = parseFloat(match[2] ?? match[1]);
    if (!Number.isFinite(value)) continue;
    const unit = match[3].toLowerCase();
    const minutes = unit.startsWith('sec') ? value / 60 : unit.startsWith('h') ? value * 60 : value;
    if (best === undefined || minutes > best) best = minutes;
  }
  return best === undefined ? undefined : Math.round(best * 100) / 100;
}

export function buildSteps(texts: string[]): Step[] {
  return texts
    .map((t) => t.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .map((text) => {
      const step: Step = { id: newId(), text };
      const duration = extractDurationMinutes(text);
      if (duration !== undefined) step.durationMinutes = duration;
      return step;
    });
}

export interface DraftToRecipeOptions {
  cookbookId: string;
  createdBy?: string;
}

/** Turn a reviewed import draft into a storable recipe. */
export function draftToRecipe(draft: RecipeDraft, options: DraftToRecipeOptions): Recipe {
  const timestamp = nowISO();
  return {
    id: newId(),
    cookbookId: options.cookbookId,
    title: draft.title?.trim() || 'Untitled recipe',
    description: draft.description?.trim() || undefined,
    imageUri: draft.imageUri,
    servings: draft.servings && draft.servings > 0 ? draft.servings : 4,
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    ingredients: parseIngredientLines(draft.ingredientLines),
    steps: buildSteps(draft.stepTexts),
    notes: draft.notes?.trim() || undefined,
    tags: normalizeTags(draft.tags ?? []),
    nutrition: draft.nutrition,
    source: draft.source,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: options.createdBy,
  };
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/** Reverse of `draftToRecipe`, for editing an existing recipe in the same form. */
export function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    imageUri: recipe.imageUri,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    ingredientLines: recipe.ingredients.map((i) => i.raw),
    stepTexts: recipe.steps.map((s) => s.text),
    notes: recipe.notes,
    tags: recipe.tags,
    nutrition: recipe.nutrition,
    source: recipe.source,
  };
}
