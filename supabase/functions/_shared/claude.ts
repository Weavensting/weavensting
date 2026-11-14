import { Anthropic } from './deps.ts';
import { HttpError, requireEnv } from './http.ts';

/**
 * Recipe extraction with Claude.
 *
 * One schema, one system prompt, three kinds of input (photos, loose text, a
 * fetched web page). Structured outputs mean the response is always the shape
 * the app expects — no JSON repair, no "sometimes it adds a preamble".
 */

export const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5';

/**
 * Extraction is a reading task, not a reasoning one. Medium effort is the
 * sensible default; raise it with CLAUDE_EFFORT if handwriting is losing you
 * ingredients, lower it to cut cost on clean printed text.
 */
const EFFORT = (Deno.env.get('CLAUDE_EFFORT') ?? 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The name of the dish.' },
    description: { type: 'string', description: 'One sentence, only if the source gives one.' },
    servings: { type: 'integer', description: 'How many it serves. Omit if the source does not say.' },
    prepMinutes: { type: 'integer' },
    cookMinutes: { type: 'integer' },
    ingredientLines: {
      type: 'array',
      items: { type: 'string' },
      description:
        'One line per ingredient, exactly as written in the source, including amounts and preparation notes.',
    },
    stepTexts: {
      type: 'array',
      items: { type: 'string' },
      description: 'One entry per instruction step, in order, without step numbers.',
    },
    notes: { type: 'string', description: 'Asides, substitutions, or anything written in the margins.' },
    tags: { type: 'array', items: { type: 'string' } },
    nutrition: {
      type: 'object',
      properties: {
        calories: { type: 'number' },
        proteinG: { type: 'number' },
        carbsG: { type: 'number' },
        fatG: { type: 'number' },
        fiberG: { type: 'number' },
        sugarG: { type: 'number' },
        sodiumMg: { type: 'number' },
      },
      additionalProperties: false,
    },
    confidence: {
      type: 'number',
      description: 'Between 0 and 1: how confident you are that this is faithful to the source.',
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Anything you could not read or had to guess at, phrased for the cook to check.',
    },
  },
  required: ['ingredientLines', 'stepTexts'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You transcribe recipes into structured data for a family cookbook app.

Transcribe; do not improve. Keep the cook's own words, amounts, spellings and
quirks ("a good glug of oil", "bake till it smells right"). These are family
recipes — the wording is part of what people are keeping.

- Put each ingredient on its own line, exactly as written, amount included.
- Keep ingredient section headings ("For the sauce:") as their own line.
- Split instructions into one step per action, dropping any step numbers.
- Never invent a quantity, a time, a temperature or a step that is not there.
- If a word is unreadable, transcribe your best guess and add a warning naming it.
- Put anything that is not an ingredient or a step — asides, substitutions,
  dedications, "Aunt Jo's favourite" — into notes.
- Only fill in nutrition if the source states it. Do not estimate here.
- Set confidence honestly: 1.0 for clean printed text, lower for hard handwriting.

If the input is not a recipe at all, return empty arrays and say so in warnings.`;

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
  nutrition?: Record<string, number>;
  confidence?: number;
  warnings?: string[];
}

export interface ImageInput {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

/**
 * Request and response shapes stated locally rather than reached for through
 * the SDK's namespace: Deno resolves the SDK via an `npm:` specifier re-exported
 * from deps.ts, and a re-exported default does not reliably carry its merged
 * type namespace.
 */
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ClaudeResponse {
  stop_reason?: string;
  content: { type: string; text?: string }[];
}

let client: InstanceType<typeof Anthropic> | undefined;

function getClient(): InstanceType<typeof Anthropic> {
  client ??= new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  return client;
}

export async function extractFromPhotos(images: ImageInput[]): Promise<ExtractedRecipe> {
  if (images.length === 0) throw new HttpError(400, 'No photos were sent.');
  if (images.length > 8) throw new HttpError(400, 'Send at most 8 photos of one recipe.');

  const content: ContentBlock[] = images.map((image) => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
  }));

  content.push({
    type: 'text',
    text:
      images.length > 1
        ? `These ${images.length} photos are one recipe, in order. Read every one and transcribe the whole thing.`
        : 'Transcribe the recipe in this photo. It may be handwritten, a cookbook page, or a screenshot.',
  });

  return await callClaude([{ role: 'user', content }]);
}

export async function extractFromText(text: string, sourceUrl?: string): Promise<ExtractedRecipe> {
  const trimmed = text.slice(0, 120_000);
  const preamble = sourceUrl ? `This came from ${sourceUrl}.\n\n` : '';

  return await callClaude([
    {
      role: 'user',
      content:
        `${preamble}Transcribe the recipe in the text below. It may be dictated speech, a message, ` +
        `or notes typed from memory, so it can ramble — pull the recipe out of it.\n\n` +
        `<source>\n${trimmed}\n</source>`,
    },
  ]);
}

export async function extractFromPage(html: string, url: string): Promise<ExtractedRecipe> {
  const text = htmlToText(html).slice(0, 120_000);
  if (text.length < 40) throw new HttpError(422, 'There was almost no text on that page to read.');

  return await callClaude([
    {
      role: 'user',
      content:
        `Below is the readable text of ${url}. Find the recipe in it and transcribe it, ignoring ` +
        `navigation, comments, adverts and the blog story above the recipe.\n\n` +
        `<page>\n${text}\n</page>`,
    },
  ]);
}

async function callClaude(messages: Message[]): Promise<ExtractedRecipe> {
  let response: ClaudeResponse;
  try {
    response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      messages,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: EFFORT,
        format: { type: 'json_schema', schema: RECIPE_SCHEMA },
      },
      // Route around a safety refusal instead of failing the import outright.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 429) throw new HttpError(429, 'The recipe reader is busy right now. Try again in a moment.');
    if (status === 401) throw new HttpError(500, 'The server is missing a valid Claude API key.');
    console.error('claude call failed', error);
    throw new HttpError(502, 'The recipe reader could not be reached.');
  }

  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'That content could not be read as a recipe.');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('');

  if (!text.trim()) throw new HttpError(502, 'The recipe reader returned nothing.');

  let parsed: ExtractedRecipe;
  try {
    parsed = JSON.parse(text) as ExtractedRecipe;
  } catch {
    console.error('unparseable model output', text.slice(0, 500));
    throw new HttpError(502, 'The recipe reader returned something unreadable.');
  }

  return {
    ...parsed,
    ingredientLines: (parsed.ingredientLines ?? []).filter((line) => line?.trim()),
    stepTexts: (parsed.stepTexts ?? []).filter((line) => line?.trim()),
  };
}

/**
 * Reduce a page to the text a reader would see.
 *
 * Trimming scripts, styles and navigation before the model sees the page cuts
 * the input by roughly an order of magnitude, which is most of the cost of a
 * URL import.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(?:nav|header|footer|aside|form)[\s\S]*?<\/(?:nav|header|footer|aside|form)>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
