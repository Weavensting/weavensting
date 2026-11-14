import type { Cookbook, ID, PantryItem, Recipe } from '../domain/types';
import { getSupabase } from './supabase';
import { cookbookToRow, recipeToRow, rowToCookbook, rowToPantryItem, rowToRecipe } from './rows';

/**
 * Every read and write against Supabase.
 *
 * The server is the source of truth: each write returns the stored row, and
 * that row — not the object the app sent — is what gets cached. So
 * server-assigned fields (`updated_at`, defaults, anything a trigger touches)
 * are always what the app is holding.
 */

export class RemoteError extends Error {
  constructor(message: string, readonly offline: boolean) {
    super(message);
    this.name = 'RemoteError';
  }
}

/**
 * A failed request is either "the network is not there" — which the outbox
 * retries — or "the server said no", which retrying will not fix.
 */
export function isOffline(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = (error as { message?: string })?.message?.toLowerCase() ?? '';
  return (
    (error as Error)?.name === 'TypeError' ||
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('fetch failed')
  );
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new RemoteError('The cookbook server is not configured.', false);
  return supabase;
}

/** Turn a PostgREST error into something the app can act on. */
function fail(context: string, error: unknown): never {
  const message = (error as { message?: string })?.message ?? String(error);
  throw new RemoteError(`${context}: ${message}`, isOffline(error));
}

export interface RemoteSnapshot {
  cookbooks: Cookbook[];
  recipes: Recipe[];
  pantry: PantryItem[];
}

/** Everything this user can see. Small enough to fetch whole for a family. */
export async function fetchEverything(): Promise<RemoteSnapshot> {
  const supabase = client();
  const [cookbooks, recipes, pantry] = await Promise.all([
    supabase.from('cookbooks').select('*'),
    supabase.from('recipes').select('*'),
    supabase.from('pantry_items').select('*'),
  ]);

  if (cookbooks.error) fail('Could not load cookbooks', cookbooks.error);
  if (recipes.error) fail('Could not load recipes', recipes.error);
  if (pantry.error) fail('Could not load the pantry', pantry.error);

  return {
    cookbooks: (cookbooks.data ?? []).map(rowToCookbook),
    recipes: (recipes.data ?? []).map(rowToRecipe),
    pantry: (pantry.data ?? []).map(rowToPantryItem),
  };
}

/**
 * The cookbook this person writes into, created on first use.
 *
 * Server-side so that signing in on two devices at once cannot make two.
 */
export async function ensureDefaultCookbook(name = 'Family Cookbook'): Promise<Cookbook> {
  const { data, error } = await client().rpc('ensure_default_cookbook', { p_name: name });
  if (error) fail('Could not open your cookbook', error);
  return rowToCookbook(data as Record<string, any>);
}

export async function saveRecipe(recipe: Recipe): Promise<Recipe> {
  const { data, error } = await client()
    .from('recipes')
    .upsert(recipeToRow(recipe), { onConflict: 'id' })
    .select()
    .single();

  if (error) fail('Could not save the recipe', error);
  return rowToRecipe(data as Record<string, any>);
}

export async function saveCookbook(cookbook: Cookbook): Promise<Cookbook> {
  const { data, error } = await client()
    .from('cookbooks')
    .upsert(cookbookToRow(cookbook), { onConflict: 'id' })
    .select()
    .single();

  if (error) fail('Could not save the cookbook', error);
  return rowToCookbook(data as Record<string, any>);
}

/**
 * Add a pantry item by name.
 *
 * Goes through an RPC because "one row per food per person" is a rule only the
 * database can enforce: two phones adding "eggs" invent two different ids, and
 * an upsert keyed on id would insert both and trip the unique index.
 */
export async function addPantryItem(name: string, staple = false): Promise<PantryItem> {
  const { data, error } = await client().rpc('upsert_pantry_item', {
    p_name: name,
    p_staple: staple,
  });
  if (error) fail('Could not add that to the pantry', error);
  return rowToPantryItem(data as Record<string, any>);
}

export async function removePantryItem(id: ID): Promise<PantryItem> {
  const { data, error } = await client()
    .from('pantry_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) fail('Could not remove that from the pantry', error);
  return rowToPantryItem(data as Record<string, any>);
}
