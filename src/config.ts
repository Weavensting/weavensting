/**
 * Runtime configuration.
 *
 * Values come from `EXPO_PUBLIC_*` environment variables. Metro inlines these
 * at build time by **textual substitution of a static member access** — so each
 * one must be written out as `process.env.EXPO_PUBLIC_NAME` in full. A computed
 * lookup like `process.env[name]` is not substituted and silently reads
 * undefined in a release build, which looks exactly like "not configured yet".
 *
 * Only put things here that are safe in a shipped app bundle: the Supabase anon
 * key is (row-level security gates it) and OAuth client IDs are (they are public
 * identifiers by design). The Claude API key is emphatically not — that stays in
 * the Edge Function's secrets.
 */

function clean(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

export const config = {
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL)?.replace(/\/+$/, ''),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),

  /**
   * Google OAuth client IDs.
   *
   * The web client ID is used on every platform: it is the audience Supabase
   * validates the ID token against. The iOS one additionally identifies the app
   * to the native sign-in sheet. Android needs no client ID at runtime — it is
   * matched by package name and signing certificate fingerprint instead, which
   * is why an Android build signed with a different key stops working.
   */
  googleWebClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  googleIosClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
};

/** True once a Supabase project is wired up; until then the app is local-only. */
export const isCloudConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

/** True once Google sign-in has the client IDs it needs. */
export const isGoogleConfigured = Boolean(isCloudConfigured && config.googleWebClientId);
