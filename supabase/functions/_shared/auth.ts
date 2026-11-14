import { createClient } from './deps.ts';
import { HttpError, requireEnv } from './http.ts';

/**
 * Identify the caller and charge the call against their daily quota.
 *
 * The anon key ships inside the app, so anyone who installs it can send
 * requests here. Requiring a signed-in user plus a per-user ceiling is what
 * keeps a copied key from running up the Claude bill.
 */
export async function authorize(req: Request, kind: string): Promise<string> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in to import recipes.');

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await asUser.auth.getUser();
  if (error || !data.user) {
    if (Deno.env.get('ALLOW_ANONYMOUS_EXTRACTION') === 'true') return 'anonymous';
    throw new HttpError(401, 'Sign in to import recipes.');
  }

  const dailyLimit = Number(Deno.env.get('EXTRACTION_DAILY_LIMIT') ?? '50');
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: allowed, error: quotaError } = await admin.rpc('record_extraction', {
    target_user: data.user.id,
    extraction_kind: kind,
    daily_limit: dailyLimit,
  });

  if (quotaError) {
    // A broken quota table should not take recipe import down with it.
    console.error('quota check failed', quotaError);
    return data.user.id;
  }
  if (allowed === false) {
    throw new HttpError(429, `You have hit today's import limit of ${dailyLimit}. Try again tomorrow.`);
  }
  return data.user.id;
}
