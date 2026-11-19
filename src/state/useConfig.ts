import { useSyncExternalStore } from 'react';
import { getConfig, subscribeConfig, type AppConfig } from '../config';

/** Subscribe a component to which project the app is pointed at. */
export function useConfig(): AppConfig {
  return useSyncExternalStore(subscribeConfig, getConfig, getConfig);
}
