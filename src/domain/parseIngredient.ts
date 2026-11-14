import type { Ingredient, Unit } from './types';
import { normalizeUnit, parseQuantity } from './units';
import { newId } from './id';

/**
 * Words that mark the tail of a line as a preparation note rather than part of
 * the food's name. Anything ending in "-ed" is also treated as preparation,
 * which covers the long tail ("julienned", "spatchcocked", ...).
 */
const PREP_HEADS = new Set([
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'melted',
  'softened', 'beaten', 'peeled', 'seeded', 'drained', 'rinsed', 'cubed',
  'crushed', 'halved', 'quartered', 'julienned', 'trimmed', 'cored', 'zested',
  'juiced', 'packed', 'sifted', 'divided', 'thawed', 'cooled', 'warmed',
  'toasted', 'roasted', 'cooked', 'uncooked', 'stemmed', 'pitted',
  'room', 'at', 'to', 'plus', 'for', 'preferably', 'optional', 'or', 'about',
  'cut', 'torn', 'separated', 'lightly', 'well', 'firmly', 'loosely',
]);

const PREP_MODIFIERS = new Set([
  'finely', 'coarsely', 'roughly', 'thinly', 'thickly', 'freshly', 'well',
  'lightly', 'firmly', 'loosely', 'very', 'about', 'approximately',
]);

/** Collapse whitespace and strip bullets/numbering an importer may have left in. */
function tidy(line: string): string {
  return line
    .replace(/^[\s\-–—•*·▢□☐]+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikePreparation(segment: string): boolean {
  const words = segment.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  let i = 0;
  while (i < words.length - 1 && PREP_MODIFIERS.has(words[i])) i += 1;
  const head = words[i].replace(/[^a-z-]/g, '');
  return PREP_HEADS.has(head) || /(?:ed|ing)$/.test(head);
}

/**
 * Turn one written ingredient line into structured data.
 *
 * The original text is always preserved on `raw`; parsing is a convenience for
 * scaling, shopping lists and pantry matching, never a replacement for what the
 * cook actually wrote.
 */
export function parseIngredientLine(line: string, group?: string): Ingredient {
  const raw = tidy(line);
  const result: Ingredient = { id: newId(), raw, item: raw };
  if (!raw) return result;

  let rest = raw;
  if (group) result.group = group;

  // "(optional)" / ", optional" anywhere in the line.
  const optionalMatch = rest.match(/[,(]?\s*\boptional\b\s*\)?/i);
  if (optionalMatch) {
    result.optional = true;
    rest = (rest.slice(0, optionalMatch.index) + rest.slice(optionalMatch.index! + optionalMatch[0].length)).trim();
    rest = rest.replace(/[,\s]+$/, '');
  }

  // Leading amount, possibly a range: "2-3", "2 to 3".
  const first = parseQuantity(rest);
  if (first) {
    result.quantity = first.value;
    rest = rest.slice(first.length);

    const rangeMatch = rest.match(/^\s*(?:-|–|—|to\b)\s*/i);
    if (rangeMatch) {
      const second = parseQuantity(rest.slice(rangeMatch[0].length));
      if (second) {
        result.quantityMax = second.value;
        rest = rest.slice(rangeMatch[0].length + second.length);
      }
    }
    rest = rest.trim();
  }

  // A parenthetical size right after the amount describes the container, not the
  // amount: "1 (14.5 oz) can diced tomatoes". Keep it on `preparation`.
  const sizeMatch = rest.match(/^\(([^)]*)\)\s*/);
  let containerSize: string | undefined;
  if (sizeMatch && result.quantity !== undefined) {
    containerSize = sizeMatch[1].trim();
    rest = rest.slice(sizeMatch[0].length).trim();
  }

  // Unit directly after the amount.
  const unitMatch = rest.match(/^([A-Za-z]+\.?|"|#)(?:\s+|$)/);
  if (unitMatch) {
    const unit = normalizeUnit(unitMatch[1]);
    if (unit) {
      result.unit = unit;
      rest = rest.slice(unitMatch[0].length).trim();
    }
  }
  // Two-word units ("fl oz") that the single-token match above misses.
  if (!result.unit) {
    const twoWord = rest.match(/^(fl\.?\s*oz\.?|fluid ounces?)(?:\s+|$)/i);
    if (twoWord) {
      result.unit = 'fl-oz' as Unit;
      rest = rest.slice(twoWord[0].length).trim();
    }
  }

  rest = rest.replace(/^of\s+/i, '').trim();

  // Phrases that trail the food without a comma: "salt to taste",
  // "1 cup flour plus more for dusting".
  const trailingPrep = rest.match(
    /\s+((?:to taste|for serving|for garnish|for dusting|as needed|divided|plus more(?:\s+\S+)*)\s*)$/i,
  );
  const looseParts: string[] = [];
  if (trailingPrep) {
    looseParts.push(trailingPrep[1].trim());
    rest = rest.slice(0, trailingPrep.index).trim();
  }

  // Split preparation off the tail. A trailing parenthetical counts too.
  const trailingParen = rest.match(/\s*\(([^)]*)\)\s*$/);
  const prepParts: string[] = [];
  if (trailingParen) {
    prepParts.push(trailingParen[1].trim());
    rest = rest.slice(0, trailingParen.index).trim();
  }

  const commaIndex = rest.indexOf(',');
  if (commaIndex > 0) {
    const tail = rest.slice(commaIndex + 1).trim();
    if (tail && looksLikePreparation(tail)) {
      prepParts.unshift(tail);
      rest = rest.slice(0, commaIndex).trim();
    }
  }

  prepParts.push(...looseParts);
  if (containerSize) prepParts.unshift(containerSize);
  if (prepParts.length > 0) result.preparation = prepParts.join(', ');

  result.item = rest.replace(/[.,;]+$/, '').trim() || raw;
  return result;
}

export function parseIngredientLines(lines: string[]): Ingredient[] {
  const out: Ingredient[] = [];
  let group: string | undefined;

  for (const line of lines) {
    const text = tidy(line);
    if (!text) continue;

    // A heading like "For the sauce:" or "TOPPING" groups the lines beneath it.
    if (isGroupHeading(text)) {
      group = text.replace(/:$/, '').replace(/^for the\s+/i, '').trim();
      continue;
    }
    out.push(parseIngredientLine(text, group));
  }
  return out;
}

function isGroupHeading(text: string): boolean {
  if (text.length > 48) return false;
  if (/^for the\b/i.test(text)) return true;
  if (text.endsWith(':')) return true;
  // ALL CAPS with no digits, e.g. "STREUSEL TOPPING".
  return /^[A-Z][A-Z\s&'-]{2,}$/.test(text) && !/\d/.test(text);
}
