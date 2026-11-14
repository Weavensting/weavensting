/**
 * Core domain types.
 *
 * Everything the app stores is a plain JSON-serialisable object so the same
 * shapes travel unchanged between the local store, the sync layer and the
 * recipe-extraction service.
 */

export type ID = string;
export type ISODate = string;

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export type UnitSystem = 'metric' | 'imperial';
export type UnitKind = 'volume' | 'mass' | 'count' | 'length';

/** Canonical unit identifiers. Free text like "Tbsp." is normalised into one. */
export type Unit =
  // volume
  | 'ml' | 'l' | 'tsp' | 'tbsp' | 'fl-oz' | 'cup' | 'pint' | 'quart' | 'gallon'
  // mass
  | 'g' | 'kg' | 'oz' | 'lb'
  // count-ish
  | 'piece' | 'clove' | 'slice' | 'can' | 'package' | 'bunch' | 'pinch' | 'dash'
  | 'sheet' | 'stick' | 'sprig' | 'head' | 'stalk' | 'ear' | 'strip'
  // length (pan sizes, dough thickness)
  | 'cm' | 'inch';

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export interface Ingredient {
  id: ID;
  /** Exactly what the cook wrote. Never overwritten — it is the source of truth. */
  raw: string;
  /** Normalised amount. `1 1/2` and `1.5` and `½` all become 1.5. */
  quantity?: number;
  /** Upper bound when the recipe gives a range ("2-3 cloves garlic"). */
  quantityMax?: number;
  unit?: Unit;
  /** The food itself, stripped of preparation notes. */
  item: string;
  /** "finely chopped", "at room temperature" */
  preparation?: string;
  optional?: boolean;
  /** Sub-recipe heading, e.g. "For the streusel". */
  group?: string;
}

export interface Step {
  id: ID;
  text: string;
  /** Minutes this step takes, when the text names a duration. Drives cook-mode timers. */
  durationMinutes?: number;
  group?: string;
}

/** Per serving. All fields optional — most family recipes have none of this. */
export interface Nutrition {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  /** How these numbers were arrived at, so the UI can be honest about accuracy. */
  basis?: 'source' | 'estimated' | 'manual';
}

export type ImportMethod =
  | 'manual' | 'url' | 'pinterest' | 'youtube' | 'photo' | 'voice' | 'text';

export interface RecipeSource {
  method: ImportMethod;
  url?: string;
  siteName?: string;
  author?: string;
  /** Who in the family this came from — the whole point of a family cookbook. */
  familyAttribution?: string;
  importedAt?: ISODate;
}

export interface Recipe {
  id: ID;
  cookbookId: ID;
  title: string;
  description?: string;
  imageUri?: string;
  /** Photos of the original handwritten card, kept alongside the typed version. */
  originalImageUris?: string[];
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: Ingredient[];
  steps: Step[];
  notes?: string;
  tags: string[];
  nutrition?: Nutrition;
  source?: RecipeSource;
  rating?: number;
  /** Bumped every time someone cooks it — powers "what we actually make". */
  timesCooked?: number;
  lastCookedAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy?: ID;
  /** Soft delete so sync can propagate removals. */
  deletedAt?: ISODate;
}

/** A shared family collection. Everyone in it sees the same recipes. */
export interface Cookbook {
  id: ID;
  name: string;
  description?: string;
  ownerId?: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  deletedAt?: ISODate;
}

export interface PantryItem {
  id: ID;
  /** Normalised food name, matched against `Ingredient.item`. */
  name: string;
  quantity?: number;
  unit?: Unit;
  /** Staples are assumed always on hand and never count as "missing". */
  staple?: boolean;
  expiresAt?: ISODate;
  updatedAt: ISODate;
  deletedAt?: ISODate;
}

// ---------------------------------------------------------------------------
// Import drafts
// ---------------------------------------------------------------------------

/**
 * What an importer produces. Deliberately looser than `Recipe`: an extractor is
 * allowed to be unsure, and the review screen is where a human resolves it.
 */
export interface RecipeDraft {
  title?: string;
  description?: string;
  imageUri?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  /** Unparsed ingredient lines, one per entry. */
  ingredientLines: string[];
  stepTexts: string[];
  notes?: string;
  tags?: string[];
  nutrition?: Nutrition;
  source?: RecipeSource;
  /** 0–1. Below ~0.7 the review screen warns before saving. */
  confidence?: number;
  /** Things the extractor could not read, for the review screen to highlight. */
  warnings?: string[];
}
