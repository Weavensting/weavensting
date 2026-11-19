import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the app finds its Supabase project.
 *
 * Two sources, in order:
 *
 * 1. **Build time** — `EXPO_PUBLIC_*` variables, inlined by Metro. This is how
 *    a build you hand to the family is configured: everyone who installs it is
 *    already pointed at the right project.
 * 2. **Runtime** — typed into the connect screen and kept on the device. This
 *    exists so a build can ship with no project at all and be pointed at one
 *    later, without rebuilding.
 *
 * Build time wins when both exist. A build that was deliberately pointed at a
 * project should not be redirected by whatever is left on one device.
 *
 * Metro inlines `EXPO_PUBLIC_*` by substituting a **static** member access, so
 * each variable is written out in full below. A computed `process.env[name]`
 * is not substituted and reads undefined in a release build, which looks
 * exactly like "not configured yet".
 *
 * Nothing here is a secret. The Supabase anon key is meant to ship inside the
 * app — row-level security, not key secrecy, is what protects the data — and
 * OAuth client IDs are public identifiers. The keys that must stay private
 * (the service role key, the Claude API key) live only in the Edge Function's
 * secrets and never reach the client.
 */

const STORAGE_KEY = 'cookbook:connection';

export interface Connection {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface AppConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /**
   * The web client ID is the audience Supabase validates the Google ID token
   * against, on every platform. The iOS one additionally identifies the app to
   * the native sign-in sheet. Android needs no client ID at runtime — it is
   * matched by package name and signing-certificate fingerprint instead.
   */
  googleWebClientId?: string;
  googleIosClientId?: string;
  /** Where the Supabase values came from, so the UI can explain itself. */
  source: 'build' | 'device' | 'none';
}

function clean(value: string | undefined | null): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function tidyUrl(value: string | undefined): string | undefined {
  return clean(value)?.replace(/\/+$/, '');
}

const buildTime = {
  supabaseUrl: tidyUrl(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  googleWebClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  googleIosClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
};

/** True when this build already names a project, so the connect screen is moot. */
export const hasBuildTimeConnection = Boolean(
  buildTime.supabaseUrl && buildTime.supabaseAnonKey,
);

let stored: Connection | undefined;
let loaded = false;

const listeners = new Set<() => void>();
let snapshot: AppConfig = resolve();

function resolve(): AppConfig {
  if (hasBuildTimeConnection) {
    return { ...buildTime, source: 'build' };
  }
  if (stored) {
    return { ...buildTime, ...stored, source: 'device' };
  }
  return { ...buildTime, supabaseUrl: undefined, supabaseAnonKey: undefined, source: 'none' };
}

function publish(): void {
  snapshot = resolve();
  for (const listener of listeners) listener();
}

export function getConfig(): AppConfig {
  return snapshot;
}

export function subscribeConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once a project is known, from either source. */
export function isCloudConfigured(): boolean {
  return Boolean(snapshot.supabaseUrl && snapshot.supabaseAnonKey);
}

/** True once Google sign-in has the client IDs it needs. */
export function isGoogleConfigured(): boolean {
  return Boolean(isCloudConfigured() && snapshot.googleWebClientId);
}

/** Read what was saved on this device. Called once, before the first screen. */
export async function loadStoredConnection(): Promise<void> {
  if (loaded || hasBuildTimeConnection) {
    loaded = true;
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Connection>;
      const url = tidyUrl(parsed.supabaseUrl);
      const key = clean(parsed.supabaseAnonKey);
      if (url && key) stored = { supabaseUrl: url, supabaseAnonKey: key };
    }
  } catch (error) {
    // Unreadable storage should not stop the app; the connect screen shows instead.
    console.warn('[config] could not read the saved connection', error);
  } finally {
    loaded = true;
    publish();
  }
}

export async function saveConnection(connection: Connection): Promise<void> {
  const url = tidyUrl(connection.supabaseUrl);
  const key = clean(connection.supabaseAnonKey);
  if (!url || !key) throw new Error('Both the project URL and the anon key are needed.');

  stored = { supabaseUrl: url, supabaseAnonKey: key };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  publish();
}

export async function clearConnection(): Promise<void> {
  stored = undefined;
  await AsyncStorage.removeItem(STORAGE_KEY);
  publish();
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ConnectionProblem {
  field: 'url' | 'key';
  message: string;
}

/**
 * Catch the mistakes that are obvious without a network round trip, so the
 * common typos get a useful message rather than a generic failure.
 */
export function validateConnection(url: string, key: string): ConnectionProblem[] {
  const problems: ConnectionProblem[] = [];
  const trimmedUrl = url.trim();
  const trimmedKey = key.trim();

  if (!trimmedUrl) {
    problems.push({ field: 'url', message: 'Paste the Project URL from Settings → API.' });
  } else {
    let parsed: URL | undefined;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      problems.push({ field: 'url', message: 'That is not a valid URL.' });
    }
    if (parsed) {
      if (parsed.protocol !== 'https:') {
        problems.push({ field: 'url', message: 'The project URL should start with https://' });
      } else if (parsed.pathname.replace(/\/+$/, '') !== '') {
        // People paste the dashboard link rather than the API URL.
        problems.push({
          field: 'url',
          message: 'That looks like a dashboard link. The Project URL has no path after the host.',
        });
      }
    }
  }

  if (!trimmedKey) {
    problems.push({ field: 'key', message: 'Paste the anon public key from Settings → API.' });
  } else if (trimmedKey.split('.').length !== 3) {
    problems.push({ field: 'key', message: 'That does not look like a Supabase key.' });
  } else if (looksLikeServiceRole(trimmedKey)) {
    // Shipping this in an app would hand every install full access to everyone's data.
    problems.push({
      field: 'key',
      message: 'That is the service_role key — it bypasses all security. Use the anon public key.',
    });
  }

  return problems;
}

/** Read the `role` claim without verifying the signature; this is a typo check. */
function looksLikeServiceRole(token: string): boolean {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(decodeBase64(payload)) as { role?: string };
    return json.role === 'service_role';
  } catch {
    return false;
  }
}

function decodeBase64(value: string): string {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  if (typeof atob === 'function') return atob(padded);
  // Node (tests) has no atob on older runtimes.
  return Buffer.from(padded, 'base64').toString('binary');
}

/**
 * Ask the project whether it is really there and whether it accepts the key.
 *
 * A URL typo and a wrong key fail very differently, and finding out now is
 * much kinder than finding out at the sign-in screen.
 */
export async function testConnection(
  url: string,
  key: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const base = tidyUrl(url);
  if (!base) return { ok: false, message: 'Enter the project URL first.' };

  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/`, {
      headers: { apikey: key.trim(), Authorization: `Bearer ${key.trim()}` },
      signal,
    });
  } catch {
    return {
      ok: false,
      message: 'Could not reach that project. Check the URL, and that you are online.',
    };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, message: 'The project answered, but rejected that key.' };
  }
  if (!response.ok) {
    return { ok: false, message: `The project answered with ${response.status}.` };
  }
  return { ok: true };
}
