import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { getConfig, isGoogleConfigured } from '../config';
import { getSupabase } from '../data/supabase';

/**
 * Native sign-in with Google and Apple.
 *
 * Both use the same shape: the platform hands back an OpenID Connect ID token,
 * and Supabase exchanges it for a session with `signInWithIdToken`. No browser
 * redirect, no deep link to catch — the account picker is the system's own.
 */

export class SignInError extends Error {
  constructor(message: string, readonly code: 'cancelled' | 'unavailable' | 'failed' = 'failed') {
    super(message);
    this.name = 'SignInError';
  }
}

let googleConfigured = false;

function configureGoogle(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({
    // Supabase validates the ID token against the WEB client ID, on every
    // platform — this is the one that must also be set as the provider's client
    // ID in the Supabase dashboard.
    webClientId: getConfig().googleWebClientId,
    iosClientId: getConfig().googleIosClientId,
    scopes: ['profile', 'email'],
  });
  googleConfigured = true;
}

export function isGoogleAvailable(): boolean {
  return isGoogleConfigured() && Platform.OS !== 'web';
}

export async function signInWithGoogle(): Promise<Session> {
  const supabase = getSupabase();
  if (!supabase) throw new SignInError('Sign-in is not set up yet.', 'unavailable');
  if (!isGoogleConfigured()) {
    throw new SignInError('Google sign-in needs its client IDs. See docs/setup.md.', 'unavailable');
  }

  configureGoogle();

  let idToken: string | null;
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') throw new SignInError('Sign-in cancelled.', 'cancelled');
    idToken = response.data.idToken;
  } catch (error) {
    if (error instanceof SignInError) throw error;
    throw new SignInError(describeGoogleError(error), classifyGoogleError(error));
  }

  if (!idToken) {
    // Almost always a client-ID mismatch rather than a transient failure.
    throw new SignInError(
      'Google did not return an identity token. Check that the web client ID matches the one in Supabase.',
    );
  }

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error || !data.session) throw new SignInError(error?.message ?? 'Could not sign in with Google.');
  return data.session;
}

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<Session> {
  const supabase = getSupabase();
  if (!supabase) throw new SignInError('Sign-in is not set up yet.', 'unavailable');

  // Apple echoes back whatever string is put on the request, so the hashing is
  // ours to do: Apple gets the SHA-256, Supabase gets the raw value and hashes
  // it to compare. Sending the same value to both fails verification.
  const rawNonce = randomNonce();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let identityToken: string | null;
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    identityToken = credential.identityToken;
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      throw new SignInError('Sign-in cancelled.', 'cancelled');
    }
    throw new SignInError('Could not sign in with Apple.');
  }

  if (!identityToken) throw new SignInError('Apple did not return an identity token.');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: rawNonce,
  });
  if (error || !data.session) throw new SignInError(error?.message ?? 'Could not sign in with Apple.');
  return data.session;
}

/**
 * Browser-based Google sign-in, for the web build where the native module does
 * not exist. Supabase handles the redirect and picks the session back up.
 */
export async function signInWithGoogleOnWeb(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new SignInError('Sign-in is not set up yet.', 'unavailable');

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
  });
  if (error) throw new SignInError(error.message);
}

export async function signOutEverywhere(): Promise<void> {
  const supabase = getSupabase();
  await supabase?.auth.signOut();
  // Clear the native picker's cached account too, or the next sign-in silently
  // reuses the previous one without showing the chooser.
  if (Platform.OS !== 'web' && googleConfigured) {
    await GoogleSignin.signOut().catch(() => {});
  }
}

function randomNonce(): string {
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function classifyGoogleError(error: unknown): 'cancelled' | 'unavailable' | 'failed' {
  const code = (error as { code?: string })?.code;
  if (code === statusCodes.SIGN_IN_CANCELLED) return 'cancelled';
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return 'unavailable';
  return 'failed';
}

function describeGoogleError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return 'Google Play Services is needed to sign in with Google on this device.';
  }
  if (code === statusCodes.IN_PROGRESS) return 'A sign-in is already in progress.';
  // DEVELOPER_ERROR on Android nearly always means the signing certificate's
  // SHA-1 is not registered against the Android OAuth client.
  if (code === 'DEVELOPER_ERROR' || code === '10') {
    return 'Google rejected this build. On Android this usually means the signing certificate’s SHA-1 fingerprint is not registered in the Google Cloud console.';
  }
  return (error as Error)?.message || 'Could not sign in with Google.';
}
