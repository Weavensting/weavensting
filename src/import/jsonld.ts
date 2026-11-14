import type { Nutrition, RecipeDraft } from '../domain/types';
import { parseISODuration, parseServings } from './duration';

/**
 * Extract a recipe from a page's schema.org JSON-LD.
 *
 * Most recipe sites — and therefore most things pinned to Pinterest — publish
 * this markup for Google. When it is there, import is exact and free: no model
 * call, no guessing, no cost. The AI extractor is only for what this cannot read.
 */
export function extractRecipeFromHtml(html: string, url?: string): RecipeDraft | undefined {
  for (const node of findRecipeNodes(html)) {
    const draft = recipeNodeToDraft(node, url, html);
    if (draft) return draft;
  }
  return undefined;
}

const SCRIPT_PATTERN = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Every schema.org node on the page whose @type includes Recipe. */
export function findRecipeNodes(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    const parsed = safeParseJson(match[1]);
    if (parsed === undefined) continue;
    collectRecipes(parsed, found);
  }
  return found;
}

function safeParseJson(text: string): unknown {
  const cleaned = text.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Some sites emit JSON with trailing commas or stray control characters.
    try {
      return JSON.parse(
        cleaned.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''),
      );
    } catch {
      return undefined;
    }
  }
}

function collectRecipes(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectRecipes(entry, out);
    return;
  }
  if (!isObject(value)) return;
  if (Array.isArray(value['@graph'])) collectRecipes(value['@graph'], out);
  if (hasType(value, 'Recipe')) out.push(value);
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const raw = node['@type'];
  if (typeof raw === 'string') return raw.toLowerCase() === type.toLowerCase();
  if (Array.isArray(raw)) return raw.some((t) => typeof t === 'string' && t.toLowerCase() === type.toLowerCase());
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recipeNodeToDraft(
  node: Record<string, unknown>,
  url: string | undefined,
  html: string,
): RecipeDraft | undefined {
  const ingredientLines = toStringArray(node.recipeIngredient ?? node.ingredients);
  const stepTexts = extractInstructions(node.recipeInstructions);

  // Markup that names neither ingredients nor steps is not a usable import.
  if (ingredientLines.length === 0 && stepTexts.length === 0) return undefined;

  const totalTime = parseISODuration(node.totalTime);
  const prepMinutes = parseISODuration(node.prepTime);
  let cookMinutes = parseISODuration(node.cookTime);
  // Some sites give only prep and total; the difference is the cook time.
  if (cookMinutes === undefined && totalTime !== undefined && prepMinutes !== undefined) {
    const derived = totalTime - prepMinutes;
    if (derived > 0) cookMinutes = derived;
  }

  const warnings: string[] = [];
  if (ingredientLines.length === 0) warnings.push('No ingredients found in the page markup.');
  if (stepTexts.length === 0) warnings.push('No instructions found in the page markup.');

  return {
    title: firstString(node.name) ?? firstString(node.headline),
    description: cleanText(firstString(node.description)),
    imageUri: extractImage(node.image),
    servings: parseServings(node.recipeYield ?? node.yield),
    prepMinutes,
    cookMinutes: cookMinutes ?? (prepMinutes === undefined ? totalTime : undefined),
    ingredientLines,
    stepTexts,
    tags: extractTags(node),
    nutrition: extractNutrition(node.nutrition),
    source: {
      method: 'url',
      url,
      siteName: extractSiteName(node, html, url),
      author: extractAuthor(node.author),
      importedAt: new Date().toISOString(),
    },
    // Structured markup is exact — the only uncertainty is what the site omitted.
    confidence: warnings.length === 0 ? 1 : 0.8,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function extractInstructions(value: unknown): string[] {
  const out: string[] = [];

  const walk = (entry: unknown): void => {
    if (typeof entry === 'string') {
      out.push(...splitInstructionText(entry));
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) walk(item);
      return;
    }
    if (!isObject(entry)) return;

    // A HowToSection groups steps ("For the sauce"); flatten it.
    if (Array.isArray(entry.itemListElement)) {
      walk(entry.itemListElement);
      return;
    }
    const text = firstString(entry.text) ?? firstString(entry.name);
    if (text) out.push(...splitInstructionText(text));
  };

  walk(value);
  return out.map(cleanText).filter((s): s is string => Boolean(s));
}

/** A single blob of instructions is common; split it into steps. */
function splitInstructionText(text: string): string[] {
  const stripped = stripHtml(text);
  if (!stripped) return [];
  if (stripped.length < 200 && !/\n/.test(stripped)) return [stripped];

  const byLine = stripped.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;

  // One long paragraph: break on sentence ends, keeping the punctuation.
  const sentences = stripped.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  return sentences ? sentences.map((s) => s.trim()).filter(Boolean) : [stripped];
}

function extractImage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = extractImage(entry);
      if (found) return found;
    }
    return undefined;
  }
  if (isObject(value)) return firstString(value.url) ?? firstString(value.contentUrl);
  return undefined;
}

function extractAuthor(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return extractAuthor(value[0]);
  if (isObject(value)) return firstString(value.name);
  return undefined;
}

function extractSiteName(
  node: Record<string, unknown>,
  html: string,
  url: string | undefined,
): string | undefined {
  const publisher = node.publisher;
  if (isObject(publisher)) {
    const name = firstString(publisher.name);
    if (name) return name;
  }
  const meta = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (meta) return decodeEntities(meta[1]);
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function extractTags(node: Record<string, unknown>): string[] {
  const raw = [
    ...toStringArray(node.keywords).flatMap((k) => k.split(',')),
    ...toStringArray(node.recipeCategory),
    ...toStringArray(node.recipeCuisine),
    ...toStringArray(node.suitableForDiet).map((d) => d.replace(/^.*\//, '').replace(/Diet$/, '')),
  ];

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    const tag = entry.trim().toLowerCase();
    // Long "tags" are really sentences of SEO keywords; they make poor chips.
    if (!tag || tag.length > 30 || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags.slice(0, 12);
}

function extractNutrition(value: unknown): Nutrition | undefined {
  if (!isObject(value)) return undefined;

  const num = (field: unknown): number | undefined => {
    if (typeof field === 'number' && Number.isFinite(field)) return field;
    if (typeof field !== 'string') return undefined;
    const match = /(\d+(?:\.\d+)?)/.exec(field);
    return match ? parseFloat(match[1]) : undefined;
  };

  const nutrition: Nutrition = {
    calories: num(value.calories),
    proteinG: num(value.proteinContent),
    carbsG: num(value.carbohydrateContent),
    fatG: num(value.fatContent),
    fiberG: num(value.fiberContent),
    sugarG: num(value.sugarContent),
    sodiumMg: num(value.sodiumContent),
    basis: 'source',
  };

  const hasAny = Object.entries(nutrition).some(([key, v]) => key !== 'basis' && v !== undefined);
  return hasAny ? nutrition : undefined;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value].map(stripHtml).filter(Boolean);
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => (typeof entry === 'string' ? [entry] : isObject(entry) ? [firstString(entry.name) ?? ''] : []))
      .map(stripHtml)
      .filter(Boolean);
  }
  return [];
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
  }
  return undefined;
}

function cleanText(value: string | undefined): string | undefined {
  const text = stripHtml(value ?? '');
  return text || undefined;
}

export function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li)>/gi, '\n')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔',
  deg: '°', eacute: 'é', egrave: 'è', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const num = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}
