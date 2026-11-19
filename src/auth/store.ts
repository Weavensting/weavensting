import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '../data/supabase';
import { isCloudConfigured, subscribeConfig } from '../config';
import { beginSession, endSession } from '../data/session';

/**
 * Who is signed in.
 *
 * The cookbook is a shared database, so there is no signed-out mode: an account
 * is what a cookbook belongs to, and what row-level security checks on every
 * read. The session drives the data layer — signing in starts it, signing out
 * clears the cache, because the cache is the server's data and not the device's.
 */

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in' | 'unavailable';
  user?: User;
  session?: Session;
  /** Set when the last sign-in attempt failed, for the sign-in screen to show. */
  error?: string;
}

const UNAVAILABLE: AuthState = { status: 'unavailable' };

type Listener = () => void;

class AuthStore {
  private state: AuthState = isCloudConfigured() ? { status: 'loading' } : UNAVAILABLE;
  private listeners = new Set<Listener>();
  private started = false;

  getState = (): AuthState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Idempotent. Reads any stored session and then follows Supabase's events.
   *
   * A project can be chosen on the connect screen after the app has already
   * started, so this waits for one rather than giving up the first time.
   */
  start = (): void => {
    if (this.started) return;

    const supabase = getSupabase();
    if (!supabase) {
      this.publish(UNAVAILABLE);
      subscribeConfig(() => {
        if (isCloudConfigured()) this.start();
      });
      return;
    }
    this.started = true;

    void supabase.auth.getSession().then(({ data }) => this.applySession(data.session ?? undefined));
    supabase.auth.onAuthStateChange((_event, session) => this.applySession(session ?? undefined));
  };

  private applySession(session: Session | undefined): void {
    const previous = this.state.user?.id;

    if (session?.user) {
      this.publish({ status: 'signed-in', session, user: session.user });
      if (previous !== session.user.id) {
        void beginSession(session.user.id).catch((error) => {
          console.warn('[auth] could not open the cookbook', error);
        });
      }
      return;
    }

    this.publish({ status: 'signed-out' });
    if (previous) void endSession().catch(() => {});
  }

  setError = (error: string | undefined): void => {
    this.publish({ ...this.state, error });
  };

  private publish(next: AuthState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** Test seam. */
  resetForTesting = (): void => {
    this.state = isCloudConfigured() ? { status: 'loading' } : UNAVAILABLE;
    this.started = false;
    this.listeners.clear();
  };
}

export const authStore = new AuthStore();

/** A short, friendly name for the signed-in person. */
export function displayName(user: User | undefined): string {
  if (!user) return 'Signed out';
  const metadata = user.user_metadata ?? {};
  const name = metadata.full_name ?? metadata.name ?? metadata.preferred_username;
  if (typeof name === 'string' && name.trim()) return name.trim();
  // Apple's private relay addresses are long and ugly; the local part is kinder.
  return user.email?.split('@')[0] ?? 'Signed in';
}
