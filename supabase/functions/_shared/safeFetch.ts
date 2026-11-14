import { HttpError } from './http.ts';

/**
 * Fetch a page on the client's behalf, without becoming an open proxy into the
 * private network.
 *
 * The client supplies the URL, so every hop is checked: scheme, hostname, and
 * the addresses that hostname resolves to. Redirects are followed manually so a
 * public URL cannot bounce to `169.254.169.254` and read cloud credentials.
 */

const MAX_REDIRECTS = 3;
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface FetchedPage {
  html: string;
  finalUrl: string;
}

export async function fetchPublicPage(rawUrl: string): Promise<FetchedPage> {
  let current = await assertPublicUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (error) {
      clearTimeout(timer);
      throw new HttpError(502, `Could not load that page: ${(error as Error).message}`);
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new HttpError(502, 'That page redirected without saying where.');
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(
        response.status === 404 ? 404 : 502,
        `That page returned ${response.status}. It may need a login, or the link may be wrong.`,
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      await response.body?.cancel();
      throw new HttpError(415, 'That link is not a web page.');
    }

    return { html: await readCapped(response), finalUrl: current };
  }

  throw new HttpError(502, 'That page redirected too many times.');
}

/** Read at most MAX_BYTES so a huge page cannot exhaust the function's memory. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});

  const merged = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const room = merged.length - offset;
    if (room <= 0) break;
    merged.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.length, room);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

export async function assertPublicUrl(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, 'That is not a valid link.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Only http and https links can be imported.');
  }
  if (url.username || url.password) {
    throw new HttpError(400, 'Links with embedded credentials are not allowed.');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new HttpError(400, 'That link points somewhere private.');
  }

  const addresses = isIpLiteral(host) ? [host] : await resolveHost(host);
  if (addresses.length === 0) throw new HttpError(400, 'That address could not be found.');
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new HttpError(400, 'That link points somewhere private.');
  }
  return url.toString();
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

async function resolveHost(host: string): Promise<string[]> {
  const lookups = await Promise.allSettled([
    Deno.resolveDns(host, 'A'),
    Deno.resolveDns(host, 'AAAA'),
  ]);
  return lookups.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

/** Loopback, link-local, and every RFC 1918 / unique-local range. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();

  if (ip.includes(':')) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
    // IPv4-mapped IPv6, e.g. ::ffff:10.0.0.1
    const mapped = /::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, including cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true; // multicast and reserved
  return false;
}
