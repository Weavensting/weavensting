import type { Cookbook, PantryItem, Recipe } from '../domain/types';

/**
 * Translation between the domain objects (camelCase) and Postgres rows
 * (snake_case). Kept in one file so a schema change has a single place to land.
 */

export function recipeToRow(recipe: Recipe): Record<string, unknown> {
  return {
    id: recipe.id,
    cookbook_id: recipe.cookbookId,
    title: recipe.title,
    description: recipe.description ?? null,
    image_uri: recipe.imageUri ?? null,
    original_image_uris: recipe.originalImageUris ?? [],
    servings: recipe.servings,
    prep_minutes: recipe.prepMinutes ?? null,
    cook_minutes: recipe.cookMinutes ?? null,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    notes: recipe.notes ?? null,
    tags: recipe.tags,
    nutrition: recipe.nutrition ?? null,
    source: recipe.source ?? null,
    rating: recipe.rating ?? null,
    times_cooked: recipe.timesCooked ?? 0,
    last_cooked_at: recipe.lastCookedAt ?? null,
    created_by: recipe.createdBy ?? null,
    created_at: recipe.createdAt,
    deleted_at: recipe.deletedAt ?? null,
    // updated_at is deliberately omitted: the server's trigger sets it, and it
    // is the value every client orders and reconciles by.
  };
}

export function rowToRecipe(row: Record<string, any>): Recipe {
  return {
    id: row.id,
    cookbookId: row.cookbook_id,
    title: row.title,
    description: row.description ?? undefined,
    imageUri: row.image_uri ?? undefined,
    originalImageUris: row.original_image_uris ?? undefined,
    servings: row.servings,
    prepMinutes: row.prep_minutes ?? undefined,
    cookMinutes: row.cook_minutes ?? undefined,
    ingredients: row.ingredients ?? [],
    steps: row.steps ?? [],
    notes: row.notes ?? undefined,
    tags: row.tags ?? [],
    nutrition: row.nutrition ?? undefined,
    source: row.source ?? undefined,
    rating: row.rating ?? undefined,
    timesCooked: row.times_cooked ?? 0,
    lastCookedAt: row.last_cooked_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function cookbookToRow(cookbook: Cookbook): Record<string, unknown> {
  return {
    id: cookbook.id,
    name: cookbook.name,
    description: cookbook.description ?? null,
    owner_id: cookbook.ownerId,
    created_at: cookbook.createdAt,
    deleted_at: cookbook.deletedAt ?? null,
  };
}

export function rowToCookbook(row: Record<string, any>): Cookbook {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    ownerId: row.owner_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function rowToPantryItem(row: Record<string, any>): PantryItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity ?? undefined,
    unit: row.unit ?? undefined,
    staple: row.staple ?? false,
    expiresAt: row.expires_at ?? undefined,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}
