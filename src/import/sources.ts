import type { ImportMethod } from '../domain/types';

export type SourceKind = 'recipe-site' | 'pinterest' | 'youtube' | 'instagram' | 'tiktok';

export interface DetectedSource {
  kind: SourceKind;
  method: ImportMethod;
  /** Canonical form of the link, with tracking parameters removed. */
  url: string;
  videoId?: string;
  /**
   * Whether schema.org markup is likely. Video and social pages rarely carry
   * it, so those skip the free path and go straight to AI extraction.
   */
  expectsStructuredData: boolean;
  /** Shown while importing, so the wait is explained. */
  label: string;
}

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_|ref|ref_src|igshid|si$|feature$)/i;

export function normalizeUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const hasScheme = /^https?:\/\//i.test(trimmed);
  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  // "cornbread" would otherwise become https://cornbread. A dotless host is only
  // believable when the person actually typed a scheme (localhost, an intranet box).
  if (!hasScheme && !url.hostname.includes('.')) return undefined;

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

/** Pull the first URL out of pasted text — share sheets add plenty of chatter. */
export function findUrlInText(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  return match ? normalizeUrl(match[0]) : undefined;
}

export function detectSource(input: string): DetectedSource | undefined {
  const url = normalizeUrl(input);
  if (!url) return undefined;

  const { hostname, pathname, searchParams } = new URL(url);
  const host = hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    const videoId = host === 'youtu.be' ? pathname.slice(1) : searchParams.get('v') ?? undefined;
    return {
      kind: 'youtube',
      method: 'youtube',
      url,
      videoId: videoId || undefined,
      // Cooking videos put the recipe in the description or the spoken steps.
      expectsStructuredData: false,
      label: 'Reading the video description and captions',
    };
  }

  if (host.endsWith('pinterest.com') || host === 'pin.it') {
    return {
      kind: 'pinterest',
      method: 'pinterest',
      url,
      // A pin is a pointer; the recipe markup lives on the site it links to.
      expectsStructuredData: true,
      label: 'Following the pin to the original recipe',
    };
  }

  if (host.endsWith('instagram.com')) {
    return { kind: 'instagram', method: 'url', url, expectsStructuredData: false, label: 'Reading the post caption' };
  }
  if (host.endsWith('tiktok.com')) {
    return { kind: 'tiktok', method: 'url', url, expectsStructuredData: false, label: 'Reading the video caption' };
  }

  return {
    kind: 'recipe-site',
    method: 'url',
    url,
    expectsStructuredData: true,
    label: 'Reading the recipe page',
  };
}
