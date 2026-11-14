import type { Nutrition, RecipeDraft } from '../domain/types';
import { config, isCloudConfigured } from '../config';
import { getAccessToken } from '../auth/session';

/**
 * Client for the recipe-extraction Edge Functions.
 *
 * The Claude API key lives on the server and never ships in the app bundle —
 * anything in the bundle is readable by anyone who installs it.
 */

export interface ImageInput {
  /** Base64 without the `data:` prefix. */
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export type ExtractInput =
  | { kind: 'text'; text: string; sourceUrl?: string }
  | { kind: 'photo'; images: ImageInput[] }
  | { kind: 'url'; url: string };

export interface ExtractedRecipe {
  title?: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredientLines: string[];
  stepTexts: string[];
  notes?: string;
  tags?: string[];
  nutrition?: Nutrition;
  confidence?: number;
  warnings?: string[];
}

export class ExtractionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export function isExtractionConfigured(): boolean {
  return isCloudConfigured;
}

async function callFunction<T>(name: string, body: unknown, signal?: AbortSignal): Promise<T> {
  if (!isExtractionConfigured()) {
    throw new ExtractionError(
      'Recipe reading is not set up yet. Add your Supabase URL and anon key — see docs/setup.md.',
    );
  }

  // The functions require a signed-in user, not merely the anon key, so a copied
  // key cannot run up the API bill. Send the user's token when there is one.
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new ExtractionError('Sign in to read recipes from photos, dictation and videos.');
  }

  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: config.supabaseAnonKey!,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ExtractionError('Could not reach the recipe service. Check your connection.', error);
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      (payload as { error?: string } | undefined)?.error ??
      `The recipe service returned ${response.status}.`;
    throw new ExtractionError(message);
  }
  return payload as T;
}

/** Ask the model to read a photo, a transcript or a page into a recipe. */
export async function extractRecipe(input: ExtractInput, signal?: AbortSignal): Promise<RecipeDraft> {
  const result = await callFunction<ExtractedRecipe>('extract-recipe', input, signal);

  return {
    title: result.title,
    description: result.description,
    servings: result.servings,
    prepMinutes: result.prepMinutes,
    cookMinutes: result.cookMinutes,
    ingredientLines: result.ingredientLines ?? [],
    stepTexts: result.stepTexts ?? [],
    notes: result.notes,
    tags: result.tags,
    nutrition: result.nutrition,
    confidence: result.confidence,
    warnings: result.warnings,
  };
}

export interface FetchedPage {
  html: string;
  finalUrl: string;
}

/**
 * Fetch a page through the server.
 *
 * The web build cannot fetch other origins directly (CORS), and some sites
 * refuse requests that do not look like a browser. Going through the function
 * sidesteps both.
 */
export function fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage> {
  return callFunction<FetchedPage>('fetch-page', { url }, signal);
}

/** Ask the model to estimate macros for a recipe that came without them. */
export function estimateNutrition(
  input: { title: string; servings: number; ingredientLines: string[] },
  signal?: AbortSignal,
): Promise<Nutrition> {
  return callFunction<Nutrition>('estimate-nutrition', input, signal);
}
