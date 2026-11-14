import { AppState, type AppStateStatus } from 'react-native';
import { library } from './repository';
import { startRealtime, stopRealtime } from './realtime';

/**
 * Ties the data layer to the signed-in session and to the app's lifecycle.
 *
 * Coming back to the foreground is the moment a phone is most likely to have
 * been offline, edited, and reconnected — so that is when queued writes go out
 * and the cache is refreshed.
 */

let subscription: { remove: () => void } | undefined;
let currentUser: string | undefined;

export async function beginSession(userId: string): Promise<void> {
  if (currentUser === userId) return;
  currentUser = userId;

  await library.start(userId);
  startRealtime();

  subscription?.remove();
  subscription = AppState.addEventListener('change', onAppStateChange);
}

export async function endSession(): Promise<void> {
  currentUser = undefined;
  subscription?.remove();
  subscription = undefined;
  stopRealtime();
  await library.stop();
}

function onAppStateChange(state: AppStateStatus): void {
  if (state !== 'active' || !currentUser) return;
  void library.refresh();
}
