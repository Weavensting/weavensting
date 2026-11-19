import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateConnection, testConnection } from './config';

/**
 * The connection is the one thing a person types in by hand, so the checks
 * around it are worth testing: a bad paste should say what is wrong, and the
 * service_role key must never get through.
 */

const ANON_KEY = makeKey({ role: 'anon', ref: 'abcdefghijklm' });
const SERVICE_KEY = makeKey({ role: 'service_role', ref: 'abcdefghijklm' });

function makeKey(payload: Record<string, string>): string {
  const b64 = (value: string) =>
    Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64(JSON.stringify({ alg: 'HS256' }))}.${b64(JSON.stringify(payload))}.signature`;
}

describe('validateConnection', () => {
  it('accepts a correct project URL and anon key', () => {
    expect(validateConnection('https://abcdefghijklm.supabase.co', ANON_KEY)).toEqual([]);
  });

  it('tolerates a trailing slash and surrounding whitespace', () => {
    expect(validateConnection('  https://abcdefghijklm.supabase.co  ', ` ${ANON_KEY} `)).toEqual([]);
  });

  it('asks for the values when they are missing', () => {
    const problems = validateConnection('', '');
    expect(problems.map((p) => p.field)).toEqual(['url', 'key']);
  });

  it('rejects something that is not a URL', () => {
    expect(validateConnection('my project', ANON_KEY)[0]).toMatchObject({ field: 'url' });
  });

  it('insists on https', () => {
    expect(validateConnection('http://abcdefghijklm.supabase.co', ANON_KEY)[0].message).toContain(
      'https://',
    );
  });

  it('spots the dashboard link, which is the usual wrong paste', () => {
    const problems = validateConnection(
      'https://supabase.com/dashboard/project/abcdefghijklm',
      ANON_KEY,
    );
    expect(problems[0].message).toContain('dashboard link');
  });

  it('rejects a key that is not a JWT', () => {
    expect(validateConnection('https://abcdefghijklm.supabase.co', 'not-a-key')[0]).toMatchObject({
      field: 'key',
    });
  });

  it('refuses the service_role key', () => {
    const problems = validateConnection('https://abcdefghijklm.supabase.co', SERVICE_KEY);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain('service_role');
  });
});

describe('testConnection', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes when the project answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await expect(testConnection('https://abcdefghijklm.supabase.co', ANON_KEY)).resolves.toEqual({
      ok: true,
    });
  });

  it('sends the key both ways Supabase accepts it', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await testConnection('https://abcdefghijklm.supabase.co/', ANON_KEY);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // The trailing slash must not survive into the request path.
    expect(url).toBe('https://abcdefghijklm.supabase.co/rest/v1/');
    expect((init.headers as Record<string, string>).apikey).toBe(ANON_KEY);
  });

  it('distinguishes a bad key from a bad URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    const rejected = await testConnection('https://abcdefghijklm.supabase.co', ANON_KEY);
    expect(rejected).toMatchObject({ ok: false });
    expect((rejected as { message: string }).message).toContain('rejected that key');

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    const unreachable = await testConnection('https://nope.supabase.co', ANON_KEY);
    expect((unreachable as { message: string }).message).toContain('Could not reach');
  });

  it('reports any other status rather than claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const result = await testConnection('https://abcdefghijklm.supabase.co', ANON_KEY);
    expect((result as { message: string }).message).toContain('500');
  });
});
