import type { Unit, UnitKind, UnitSystem } from './types';

interface UnitDef {
  kind: UnitKind;
  /** Amount of the kind's base unit (ml / g / piece / mm) in one of this unit. */
  base: number;
  label: [singular: string, plural: string];
  /** Written with a space between number and unit ("2 cups") or not ("200g"). */
  spaced: boolean;
  system?: UnitSystem;
}

const UNITS: Record<Unit, UnitDef> = {
  // volume, base = ml
  ml: { kind: 'volume', base: 1, label: ['ml', 'ml'], spaced: false, system: 'metric' },
  l: { kind: 'volume', base: 1000, label: ['l', 'l'], spaced: false, system: 'metric' },
  tsp: { kind: 'volume', base: 4.92892, label: ['tsp', 'tsp'], spaced: true, system: 'imperial' },
  tbsp: { kind: 'volume', base: 14.7868, label: ['tbsp', 'tbsp'], spaced: true, system: 'imperial' },
  'fl-oz': { kind: 'volume', base: 29.5735, label: ['fl oz', 'fl oz'], spaced: true, system: 'imperial' },
  cup: { kind: 'volume', base: 236.588, label: ['cup', 'cups'], spaced: true, system: 'imperial' },
  pint: { kind: 'volume', base: 473.176, label: ['pint', 'pints'], spaced: true, system: 'imperial' },
  quart: { kind: 'volume', base: 946.353, label: ['quart', 'quarts'], spaced: true, system: 'imperial' },
  gallon: { kind: 'volume', base: 3785.41, label: ['gallon', 'gallons'], spaced: true, system: 'imperial' },

  // mass, base = g
  g: { kind: 'mass', base: 1, label: ['g', 'g'], spaced: false, system: 'metric' },
  kg: { kind: 'mass', base: 1000, label: ['kg', 'kg'], spaced: false, system: 'metric' },
  oz: { kind: 'mass', base: 28.3495, label: ['oz', 'oz'], spaced: true, system: 'imperial' },
  lb: { kind: 'mass', base: 453.592, label: ['lb', 'lb'], spaced: true, system: 'imperial' },

  // count, base = piece. Not inter-convertible; each is its own thing.
  piece: { kind: 'count', base: 1, label: ['', ''], spaced: true },
  clove: { kind: 'count', base: 1, label: ['clove', 'cloves'], spaced: true },
  slice: { kind: 'count', base: 1, label: ['slice', 'slices'], spaced: true },
  can: { kind: 'count', base: 1, label: ['can', 'cans'], spaced: true },
  package: { kind: 'count', base: 1, label: ['package', 'packages'], spaced: true },
  bunch: { kind: 'count', base: 1, label: ['bunch', 'bunches'], spaced: true },
  pinch: { kind: 'count', base: 1, label: ['pinch', 'pinches'], spaced: true },
  dash: { kind: 'count', base: 1, label: ['dash', 'dashes'], spaced: true },
  sheet: { kind: 'count', base: 1, label: ['sheet', 'sheets'], spaced: true },
  stick: { kind: 'count', base: 1, label: ['stick', 'sticks'], spaced: true },
  sprig: { kind: 'count', base: 1, label: ['sprig', 'sprigs'], spaced: true },
  head: { kind: 'count', base: 1, label: ['head', 'heads'], spaced: true },
  stalk: { kind: 'count', base: 1, label: ['stalk', 'stalks'], spaced: true },
  ear: { kind: 'count', base: 1, label: ['ear', 'ears'], spaced: true },
  strip: { kind: 'count', base: 1, label: ['strip', 'strips'], spaced: true },

  // length, base = mm
  cm: { kind: 'length', base: 10, label: ['cm', 'cm'], spaced: false, system: 'metric' },
  inch: { kind: 'length', base: 25.4, label: ['inch', 'inches'], spaced: true, system: 'imperial' },
};

/**
 * Every spelling we have seen in the wild, mapped to a canonical unit. Keys are
 * lowercased and stripped of trailing periods before lookup.
 */
const ALIASES: Record<string, Unit> = {
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', cc: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbs: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  'fl oz': 'fl-oz', floz: 'fl-oz', 'fluid ounce': 'fl-oz', 'fluid ounces': 'fl-oz',
  c: 'cup', cup: 'cup', cups: 'cup',
  pt: 'pint', pint: 'pint', pints: 'pint',
  qt: 'quart', quart: 'quart', quarts: 'quart',
  gal: 'gallon', gallon: 'gallon', gallons: 'gallon',

  g: 'g', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', '#': 'lb',

  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  pkg: 'package', package: 'package', packages: 'package', packet: 'package', packets: 'package',
  bunch: 'bunch', bunches: 'bunch',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
  sheet: 'sheet', sheets: 'sheet',
  stick: 'stick', sticks: 'stick',
  sprig: 'sprig', sprigs: 'sprig',
  head: 'head', heads: 'head',
  stalk: 'stalk', stalks: 'stalk',
  ear: 'ear', ears: 'ear',
  strip: 'strip', strips: 'strip',

  cm: 'cm', centimeter: 'cm', centimeters: 'cm',
  in: 'inch', inch: 'inch', inches: 'inch', '"': 'inch',
};

/** Resolve a free-text unit ("Tbsp.", "CUPS") to a canonical unit, or undefined. */
export function normalizeUnit(text: string | undefined | null): Unit | undefined {
  if (!text) return undefined;
  const cleaned = text.trim().replace(/\.+$/, '');
  if (!cleaned) return undefined;
  // `T` means tablespoon and `t` teaspoon — the one place casing carries meaning.
  if (cleaned === 'T') return 'tbsp';
  if (cleaned === 't') return 'tsp';
  return ALIASES[cleaned.toLowerCase()];
}

export function unitKind(unit: Unit): UnitKind {
  return UNITS[unit].kind;
}

export function unitSystem(unit: Unit): UnitSystem | undefined {
  return UNITS[unit].system;
}

/** Convert between units of the same kind. Returns undefined across kinds. */
export function convert(quantity: number, from: Unit, to: Unit): number | undefined {
  const a = UNITS[from];
  const b = UNITS[to];
  if (!a || !b || a.kind !== b.kind) return undefined;
  // Counts are not interchangeable: 2 cloves is not 2 slices.
  if (a.kind === 'count' && from !== to) return undefined;
  return (quantity * a.base) / b.base;
}

export function formatUnit(unit: Unit, quantity: number): string {
  const [singular, plural] = UNITS[unit].label;
  // Recipes write "1/2 cup", not "1/2 cups" — anything up to one takes the singular.
  return Math.abs(quantity) <= 1 ? singular : plural;
}

export function unitIsSpaced(unit: Unit): boolean {
  return UNITS[unit].spaced;
}

const VULGAR_FRACTIONS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

export const VULGAR_FRACTION_CHARS = Object.keys(VULGAR_FRACTIONS).join('');

/**
 * Parse the amount at the start of a string: "1 1/2", "1½", "½", "1/2", "2.5",
 * "1,5" (European decimal comma). Returns the value and how much it consumed.
 *
 * The forms are tried longest-first: "1/2" must be read as one half, not as the
 * whole number 1 followed by junk.
 */
export function parseQuantity(text: string): { value: number; length: number } | undefined {
  const trimmed = text.replace(/^\s+/, '');
  const leading = text.length - trimmed.length;
  const V = VULGAR_FRACTION_CHARS;

  const attempts: Array<[RegExp, (m: RegExpExecArray) => number]> = [
    // "1 1/2"
    [/^(\d+)\s+(\d+)\s*\/\s*(\d+)/, (m) => +m[1] + +m[2] / +m[3]],
    // "1½"
    [new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*([${V}])`), (m) => num(m[1]) + VULGAR_FRACTIONS[m[2]]],
    // "½"
    [new RegExp(`^([${V}])`), (m) => VULGAR_FRACTIONS[m[1]]],
    // "1/2"
    [/^(\d+)\s*\/\s*(\d+)/, (m) => +m[1] / +m[2]],
    // "2.5" / "2,5" / "2"
    [/^(\d+(?:[.,]\d+)?)/, (m) => num(m[1])],
  ];

  for (const [pattern, toValue] of attempts) {
    const m = pattern.exec(trimmed);
    if (!m) continue;
    const value = toValue(m);
    if (!Number.isFinite(value)) continue;
    return { value, length: leading + m[0].length };
  }
  return undefined;
}

function num(text: string): number {
  return parseFloat(text.replace(',', '.'));
}

// Denominators a cook actually has a measure for. Sixteenths would technically
// fit more numbers, but "2 5/16 cups" is not a usable instruction.
const COMMON_DENOMINATORS = [2, 3, 4, 8];

/**
 * Render a number the way a recipe would: "1 1/2" rather than "1.5". Falls back
 * to a decimal when no common kitchen fraction is close enough.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.floor(abs);
  const frac = abs - whole;

  for (const d of COMMON_DENOMINATORS) {
    const n = Math.round(frac * d);
    if (n === 0 || n === d) continue;
    if (Math.abs(frac - n / d) < 0.02) {
      const g = gcd(n, d);
      const fracText = `${n / g}/${d / g}`;
      return whole > 0 ? `${sign}${whole} ${fracText}` : `${sign}${fracText}`;
    }
  }

  // No clean fraction — show at most two decimals, without trailing zeros.
  return `${sign}${parseFloat(abs.toFixed(2))}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
