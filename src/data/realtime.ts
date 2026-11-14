import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { library } from './repository';
import { rowToCookbook, rowToPantryItem, rowToRecipe } from './rows';
import type { Collection } from './store';

/**
 * Live updates from the server.
 *
 * With one source of truth, a change made on one phone should land on the
 * others without anyone pulling to refresh. Row-level security applies to
 * realtime too, so subscribing to a whole table only ever delivers rows this
 * person is allowed to see.
 */

let channel: RealtimeChannel | undefined;

const TABLES: { table: string; collection: Collection; map: (row: any) => any }[] = [
  { table: 'recipes', collection: 'recipes', map: rowToRecipe },
  { table: 'cookbooks', collection: 'cookbooks', map: rowToCookbook },
  { table: 'pantry_items', collection: 'pantry', map: rowToPantryItem },
];

export function startRealtime(): void {
  const supabase = getSupabase();
  if (!supabase || channel) return;

  channel = supabase.channel('cookbook-changes');

  for (const { table, collection, map } of TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload: { new?: Record<string, unknown> }) => {
        // Deletes are soft, so every change we care about arrives with a row.
        if (!payload.new || Object.keys(payload.new).length === 0) return;
        void library.applyRealtimeRow(collection, map(payload.new)).catch((error) => {
          console.warn('[realtime] could not apply change', error);
        });
      },
    );
  }

  channel.subscribe((status) => {
    // A dropped socket means the cache may have missed changes; a full refresh
    // on reconnect is cheaper than trying to replay what was lost.
    if (status === 'SUBSCRIBED') void library.refresh();
  });
}

export function stopRealtime(): void {
  const supabase = getSupabase();
  if (channel && supabase) void supabase.removeChannel(channel);
  channel = undefined;
}
