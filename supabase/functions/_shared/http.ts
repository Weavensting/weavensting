/** Shared HTTP plumbing: CORS, JSON replies, and typed errors. */

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Wrap a handler with CORS preflight, method checks and error translation, so
 * no function has to repeat any of it — and so an unexpected throw never leaks
 * a stack trace to the client.
 */
export function handler(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

    try {
      return await fn(req);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error('unhandled error', error);
      return json({ error: 'Something went wrong reading that recipe. Try again.' }, 500);
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Expected a JSON body.');
  }
}

/** Read a required server-side secret, failing with a clear message if unset. */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `${name} is not configured on the server.`);
  return value;
}
