import { Platform } from 'react-native';
import type { RecipeDraft } from '../domain/types';
import { extractRecipeFromHtml } from './jsonld';
import { detectSource, findUrlInText, type DetectedSource } from './sources';
import {
  extractRecipe, fetchPage, isExtractionConfigured, ExtractionError, type ImageInput,
} from './extractClient';

export interface ImportProgress {
  /** Shown under the spinner so a slow import explains itself. */
  message: string;
  /** How the draft was produced, once it is known. */
  via?: 'structured-data' | 'ai';
}

export interface ImportOptions {
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Import a recipe from a link.
 *
 * Structured data first: most recipe sites publish schema.org markup, which is
 * exact, instant and free. Only when that is absent — video pages, social
 * posts, blogs without markup — does this fall back to the model.
 */
export async function importFromUrl(input: string, options: ImportOptions = {}): Promise<RecipeDraft> {
  const found = findUrlInText(input);
  const source = detectSource(input) ?? (found ? detectSource(found) : undefined);
  if (!source) {
    throw new ExtractionError('That does not look like a link. Paste a recipe URL, or type it in by hand.');
  }

  options.onProgress?.({ message: source.label });

  if (source.expectsStructuredData) {
    const draft = await tryStructuredData(source, options);
    if (draft) {
      options.onProgress?.({ message: 'Found the recipe in the page', via: 'structured-data' });
      return draft;
    }
  }

  if (!isExtractionConfigured()) {
    throw new ExtractionError(
      'No recipe markup on that page, and AI import is not set up yet. ' +
        'You can paste the recipe text instead. See docs/setup.md to enable AI import.',
    );
  }

  options.onProgress?.({ message: 'Asking the recipe reader to make sense of it', via: 'ai' });
  return withSource(await extractRecipe({ kind: 'url', url: source.url }, options.signal), source);
}

async function tryStructuredData(
  source: DetectedSource,
  options: ImportOptions,
): Promise<RecipeDraft | undefined> {
  let html: string | undefined;
  let finalUrl = source.url;

  // Try the page directly first. On iOS and Android this always works and needs
  // no server at all; on the web it succeeds only for sites that send CORS
  // headers, and fails fast otherwise. Either way a failure just falls through.
  try {
    const response = await fetch(source.url, {
      headers:
        Platform.OS === 'web'
          ? { Accept: 'text/html,application/xhtml+xml' }
          : { Accept: 'text/html,application/xhtml+xml', 'User-Agent': BROWSER_UA },
      signal: options.signal,
    });
    if (response.ok) {
      html = await response.text();
      finalUrl = response.url || source.url;
    }
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
  }

  if (!html && isExtractionConfigured()) {
    try {
      const page = await fetchPage(source.url, options.signal);
      html = page.html;
      finalUrl = page.finalUrl;
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
    }
  }

  if (!html) return undefined;
  const draft = extractRecipeFromHtml(html, finalUrl);
  return draft ? withSource(draft, { ...source, url: finalUrl }) : undefined;
}

/** Read a recipe out of photos — a handwritten card, a cookbook page, a screenshot. */
export async function importFromPhotos(
  images: ImageInput[],
  options: ImportOptions = {},
): Promise<RecipeDraft> {
  if (images.length === 0) throw new ExtractionError('Pick at least one photo of the recipe.');

  options.onProgress?.({
    message: images.length > 1 ? `Reading ${images.length} photos` : 'Reading the photo',
    via: 'ai',
  });
  const draft = await extractRecipe({ kind: 'photo', images }, options.signal);
  return { ...draft, source: { method: 'photo', importedAt: new Date().toISOString(), ...draft.source } };
}

/**
 * Turn loose text into a recipe: dictated with the keyboard's microphone,
 * pasted from a message, or typed from memory.
 */
export async function importFromText(
  text: string,
  method: 'voice' | 'text' = 'text',
  options: ImportOptions = {},
): Promise<RecipeDraft> {
  const trimmed = text.trim();
  if (trimmed.length < 20) throw new ExtractionError('There is not enough here to make a recipe from.');

  // If the text is really just a shared link, import the link instead.
  const url = findUrlInText(trimmed);
  if (url && trimmed.length < url.length + 40) return importFromUrl(url, options);

  options.onProgress?.({ message: 'Turning this into a recipe', via: 'ai' });
  const draft = await extractRecipe({ kind: 'text', text: trimmed }, options.signal);
  return { ...draft, source: { method, importedAt: new Date().toISOString(), ...draft.source } };
}

function withSource(draft: RecipeDraft, source: DetectedSource): RecipeDraft {
  return {
    ...draft,
    source: {
      method: source.method,
      url: source.url,
      importedAt: new Date().toISOString(),
      ...draft.source,
    },
  };
}
