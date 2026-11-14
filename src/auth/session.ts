import { getSupabase } from '../data/supabase';

/**
 * The current access token, or undefined when signed out.
 *
 * Kept separate from the auth store so the import client can reach it without
 * importing React state, and so Supabase's own refresh logic stays the single
 * source of token freshness.
 */
export async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase();
  if (!supabase) return undefined;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? undefined;
}
