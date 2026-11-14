// Pinned dependencies for every Edge Function. Deno resolves npm: specifiers
// directly; there is no bundler step to keep in sync.
export { default as Anthropic } from 'npm:@anthropic-ai/sdk@0.127.0';
export { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
