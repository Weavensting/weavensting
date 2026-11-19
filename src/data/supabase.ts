import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig, isCloudConfigured, subscribeConfig } from '../config';

/**
 * The Supabase client, built from whatever project the app is currently
 * pointed at.
 *
 * Because that can be set on the device rather than at build time, the client
 * is thrown away whenever the connection changes — otherwise the app would go
 * on talking to the previous project for the rest of the session.
 */

let client: SupabaseClient | undefined;
let builtFor: string | undefined;

subscribeConfig(() => {
  client = undefined;
  builtFor = undefined;
});

export function getSupabase(): SupabaseClient | undefined {
  if (!isCloudConfigured()) return undefined;

  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (client && builtFor === supabaseUrl) return client;

  client = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Only the web build has a URL bar with a session fragment to read.
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  builtFor = supabaseUrl;
  return client;
}

export { isCloudConfigured };
