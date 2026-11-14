import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, isCloudConfigured } from '../config';

/**
 * Supabase client, created lazily so the app runs perfectly well before anyone
 * sets up a project. Everything works offline and on-device; the cloud only
 * adds sharing between phones and AI-assisted import.
 */

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient | undefined {
  if (!isCloudConfigured) return undefined;
  client ??= createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Only the web build has a URL bar with a session fragment to read.
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  return client;
}

export { isCloudConfigured };
