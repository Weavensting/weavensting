import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '../data/supabase';
import { isCloudConfigured } from '../config';
import { library } from '../data/repository';

/**
 * Who is signed in, if anyone.
 *
 * Signing in is optional by design: the cookbook works fully on the device
 * without an account. An account adds two things — syncing with the family, and
 * the AI-assisted import paths that run on the server.
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
  private state: AuthState = isCloudConfigured ? { status: 'loading' } : UNAVAILABLE;
  private listeners = new Set<Listener>();
  private started = false;

  getState = (): AuthState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Idempotent. Reads any stored session and then follows Supabase's events. */
  start = (): void => {
    if (this.started) return;
    this.started = true;

    const supabase = getSupabase();
    if (!supabase) {
      this.publish(UNAVAILABLE);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      this.applySession(data.session ?? undefined);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      this.applySession(session ?? undefined);
    });
  };

  private applySession(session: Session | undefined): void {
    if (session?.user) {
      this.publish({ status: 'signed-in', session, user: session.user });
      // Recipes added before signing in are real recipes, not a demo — hand
      // them to the new account so they sync rather than being stranded.
      void library.claimLocalDataFor(session.user.id).catch((error) => {
        console.warn('[auth] could not claim local data', error);
      });
      return;
    }
    this.publish({ status: 'signed-out' });
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
    this.state = isCloudConfigured ? { status: 'loading' } : UNAVAILABLE;
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
