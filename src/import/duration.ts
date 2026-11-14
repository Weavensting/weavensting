/**
 * ISO 8601 durations, as used by schema.org's `prepTime` / `cookTime`.
 * "PT1H30M" → 90. Anything unrecognisable returns undefined rather than 0, so
 * "unknown" stays distinguishable from "instant".
 */
export function parseISODuration(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const text = value.trim().toUpperCase();
  const match =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(text);

  if (match) {
    const [, days, hours, minutes, seconds] = match;
    if (!days && !hours && !minutes && !seconds) return undefined;
    const total =
      (days ? parseFloat(days) * 1440 : 0) +
      (hours ? parseFloat(hours) * 60 : 0) +
      (minutes ? parseFloat(minutes) : 0) +
      (seconds ? parseFloat(seconds) / 60 : 0);
    return Math.round(total * 100) / 100;
  }

  // Some sites put human text in these fields ("1 hr 20 mins").
  return parseHumanDuration(text);
}

export function parseHumanDuration(text: string): number | undefined {
  let total = 0;
  let matched = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(HOURS?|HRS?|H|MINUTES?|MINS?|M)\b/gi)) {
    const value = parseFloat(m[1]);
    if (!Number.isFinite(value)) continue;
    matched = true;
    total += /^(H|HR|HRS|HOUR|HOURS)$/i.test(m[2]) ? value * 60 : value;
  }
  return matched ? Math.round(total * 100) / 100 : undefined;
}

/** "4 servings", "Serves 6", "6-8" → a number the app can scale from. */
export function parseServings(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseServings(entry);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  }
  if (typeof value !== 'string') return undefined;

  const match = /(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/.exec(value);
  if (!match) return undefined;
  // A range like "6-8 servings" scales most predictably from its lower bound.
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
