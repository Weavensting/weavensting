import { useEffect, useSyncExternalStore } from 'react';
import { authStore, type AuthState } from '../auth/store';

/** Subscribe a component to who is signed in. */
export function useAuth(): AuthState {
  useEffect(() => {
    authStore.start();
  }, []);

  return useSyncExternalStore(authStore.subscribe, authStore.getState, authStore.getState);
}

export { authStore };
