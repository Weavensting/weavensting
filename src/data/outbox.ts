import type { Recipe } from '../domain/types';
import { newId, nowISO } from '../domain/id';
import type { DocumentStore } from './store';
import * as remote from './remote';
import { RemoteError } from './remote';

/**
 * Writes made while offline, waiting for the server.
 *
 * The server is authoritative, so this is not a second copy of the data — it
 * is a queue of intentions, drained in the order they were made. A recipe
 * carries its whole state, so one `recipe.save` covers editing, deleting (a
 * save with `deletedAt`) and the cooked counter.
 */

/** What a caller asks to be queued. */
export type PendingOpInput =
  | { kind: 'recipe.save'; recipe: Recipe }
  | { kind: 'pantry.add'; name: string; staple: boolean }
  | { kind: 'pantry.remove'; itemId: string };

/** The same, once queued. Written as an intersection because `Omit` over a
 *  union keeps only the keys every member shares. */
export type PendingOp = PendingOpInput & { opId: string; at: string };

export interface DrainResult {
  sent: number;
  /** Still queued: the network did not come back. */
  remaining: number;
  /** Dropped because the server refused them; retrying would not help. */
  rejected: { op: PendingOp; reason: string }[];
}

export async function enqueue(store: DocumentStore, op: PendingOpInput): Promise<PendingOp> {
  const full: PendingOp = { ...op, opId: newId(), at: nowISO() };
  await store.write('outbox', full.opId, full);
  return full;
}

export async function readQueue(store: DocumentStore): Promise<PendingOp[]> {
  const docs = await store.readAll('outbox');
  return docs.map((d) => d.doc as PendingOp).sort((a, b) => a.at.localeCompare(b.at));
}

export async function queueLength(store: DocumentStore): Promise<number> {
  return (await store.readAll('outbox')).length;
}

/**
 * Send what is queued, oldest first.
 *
 * Stops at the first network failure so ordering is preserved — a later edit
 * must not overtake an earlier one. A server *rejection* is different: it will
 * never succeed, so the op is dropped and reported rather than blocking the
 * queue forever.
 */
export async function drain(
  store: DocumentStore,
  apply: (op: PendingOp, result: unknown) => Promise<void>,
): Promise<DrainResult> {
  const queue = await readQueue(store);
  const rejected: DrainResult['rejected'] = [];
  let sent = 0;

  for (let i = 0; i < queue.length; i += 1) {
    const op = queue[i];
    try {
      const result = await send(op);
      await apply(op, result);
      await store.hardDelete('outbox', op.opId);
      sent += 1;
    } catch (error) {
      if (error instanceof RemoteError && error.offline) {
        return { sent, remaining: queue.length - i, rejected };
      }
      await store.hardDelete('outbox', op.opId);
      rejected.push({ op, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { sent, remaining: 0, rejected };
}

function send(op: PendingOp): Promise<unknown> {
  switch (op.kind) {
    case 'recipe.save':
      return remote.saveRecipe(op.recipe);
    case 'pantry.add':
      return remote.addPantryItem(op.name, op.staple);
    case 'pantry.remove':
      return remote.removePantryItem(op.itemId);
  }
}
