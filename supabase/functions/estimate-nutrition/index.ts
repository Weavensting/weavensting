import { Anthropic } from '../_shared/deps.ts';
import { authorize } from '../_shared/auth.ts';
import { handler, json, readJson, HttpError, requireEnv } from '../_shared/http.ts';
import { MODEL } from '../_shared/claude.ts';

/**
 * Estimate calories and macros for a recipe that came without them.
 *
 * Kept separate from extraction on purpose: transcription must never invent
 * numbers, while this is explicitly an estimate and is labelled as one in the
 * app (`Nutrition.basis = 'estimated'`).
 */

const NUTRITION_SCHEMA = {
  type: 'object',
  properties: {
    calories: { type: 'number', description: 'Calories per serving.' },
    proteinG: { type: 'number' },
    carbsG: { type: 'number' },
    fatG: { type: 'number' },
    fiberG: { type: 'number' },
    sugarG: { type: 'number' },
    sodiumMg: { type: 'number' },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Anything you had to assume, such as a size for "1 onion".',
    },
  },
  required: ['calories', 'proteinG', 'carbsG', 'fatG'],
  additionalProperties: false,
} as const;

interface Body {
  title?: string;
  servings?: number;
  ingredientLines?: string[];
}

Deno.serve(
  handler(async (req) => {
    const body = await readJson<Body>(req);
    if (!Array.isArray(body.ingredientLines) || body.ingredientLines.length === 0) {
      throw new HttpError(400, 'Send the ingredient list to estimate from.');
    }

    await authorize(req, 'estimate-nutrition');

    const servings = body.servings && body.servings > 0 ? body.servings : 4;
    const client = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });

    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4_000,
      system:
        'You estimate nutrition for home recipes. Work per serving. Use standard food composition ' +
        'values, assume ordinary supermarket products, and state every assumption you make. ' +
        'These are estimates for meal planning, not clinical figures.',
      messages: [
        {
          role: 'user',
          content:
            `Recipe: ${body.title ?? 'Untitled'}\nServings: ${servings}\n\nIngredients:\n` +
            body.ingredientLines.map((line) => `- ${line}`).join('\n'),
        },
      ],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: NUTRITION_SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (response.stop_reason === 'refusal') {
      throw new HttpError(422, 'Could not estimate nutrition for that recipe.');
    }

    const text = (response.content as { type: string; text?: string }[])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    try {
      // The app records how a number was arrived at, so it can say so on screen.
      return json({ ...JSON.parse(text), basis: 'estimated' });
    } catch {
      throw new HttpError(502, 'The estimate came back unreadable.');
    }
  }),
);
