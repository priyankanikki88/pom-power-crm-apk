import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, ApiError, setOnlineListener } from './api';
import { readJson, writeJson } from './store';

/**
 * Entries made without a network. A screen saves through `sendOrQueue`: with a connection it is an ordinary request; when
 * the server cannot be reached the entry is kept on the phone and sent later, in the order it was made — when the app is
 * opened again, when any other request gets through, every half minute while something is waiting, or on "Send now".
 *
 * An entry the server refuses (the record changed meanwhile, no permission, …) is not retried on its own: it stays in the
 * list marked "not sent" with the server's reason, for the user to retry or discard. Nothing is dropped silently.
 */
export interface OutboxEntry {
  id: string;
  /** Whose entry this is: it is only ever sent while that user is signed in. */
  userId: string;
  createdAt: string;
  /** What the user did, in their words: "Follow-up done — ABC Traders". */
  title: string;
  method: 'POST' | 'PATCH';
  path: string;
  body: unknown;
  /** Query keys to refresh once it has been sent. */
  refresh: string[];
  /** Set when the server refused it. */
  error?: string;
}

const FILE = 'outbox';
let entries: OutboxEntry[] = [];
let loaded = false;
let currentUserId: string | null = null;
let queryClient: QueryClient | null = null;
let sending = false;
const listeners = new Set<() => void>();

function changed(next: OutboxEntry[]) {
  entries = next;
  writeJson(FILE, entries);
  listeners.forEach((l) => l());
}

/** Called once the signed-in user is known (and with null on sign-out). */
export async function startOutbox(userId: string | null, qc: QueryClient): Promise<void> {
  currentUserId = userId;
  queryClient = qc;
  if (!loaded) {
    entries = (await readJson<OutboxEntry[]>(FILE)) ?? [];
    loaded = true;
  }
  listeners.forEach((l) => l());
  setOnlineListener(userId ? () => void flushOutbox() : null);
  if (userId) void flushOutbox();
}

/** Removes the signed-in user's waiting entries (they chose to sign out and lose them). */
export function clearMyOutbox(): void {
  if (currentUserId) changed(entries.filter((e) => e.userId !== currentUserId));
}

const mine = () => entries.filter((e) => e.userId === currentUserId);
const send = (e: Pick<OutboxEntry, 'method' | 'path' | 'body'>) => (e.method === 'POST' ? api.post<unknown>(e.path, e.body) : api.patch<unknown>(e.path, e.body));
const isOffline = (err: unknown) => err instanceof ApiError && err.status === 0;

/**
 * Sends the request now; if the server cannot be reached, keeps it for later instead. Resolves with the server's answer,
 * or `{ queued: true }`. Any other failure (the server said no) is thrown as usual for the screen to show.
 */
export async function sendOrQueue<T>(entry: { title: string; method: 'POST' | 'PATCH'; path: string; body: unknown; refresh: string[] }): Promise<{ queued: false; data: T } | { queued: true }> {
  // Keep the order: while earlier entries are still waiting, a new one goes behind them rather than overtaking.
  if (mine().every((e) => e.error)) {
    try {
      return { queued: false, data: (await send(entry)) as T };
    } catch (err) {
      if (!isOffline(err)) throw err;
    }
  }
  if (!currentUserId) throw new ApiError(0, 'No internet connection, or the server could not be reached.');
  changed([...entries, { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId: currentUserId, createdAt: new Date().toISOString() }]);
  void flushOutbox();
  return { queued: true };
}

/** Sends what is waiting, oldest first. Stops at the first one that still cannot reach the server. */
export async function flushOutbox(includeFailed = false): Promise<void> {
  if (sending || !currentUserId) return;
  sending = true;
  try {
    if (includeFailed) changed(entries.map((e) => (e.userId === currentUserId ? { ...e, error: undefined } : e)));
    for (const e of mine().filter((x) => !x.error)) {
      try {
        await send(e);
        changed(entries.filter((x) => x.id !== e.id));
        for (const key of e.refresh) void queryClient?.invalidateQueries({ queryKey: [key] });
      } catch (err) {
        // Offline again, or signed out while sending: leave everything as it is for the next attempt.
        if (isOffline(err) || (err instanceof ApiError && err.status === 401)) return;
        changed(entries.map((x) => (x.id === e.id ? { ...x, error: err instanceof ApiError ? err.message : 'Could not be sent.' } : x)));
      }
    }
  } finally {
    sending = false;
  }
}

export function discardEntry(id: string): void {
  changed(entries.filter((e) => e.id !== id));
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
let snapshotFor: OutboxEntry[] | null = null;
let snapshotUser: string | null = null;
let snapshot: OutboxEntry[] = [];
function getSnapshot(): OutboxEntry[] {
  // The same array until something changes, as useSyncExternalStore requires.
  if (snapshotFor !== entries || snapshotUser !== currentUserId) {
    snapshotFor = entries;
    snapshotUser = currentUserId;
    snapshot = mine();
  }
  return snapshot;
}

/** The signed-in user's entries that have not reached the server yet, oldest first. */
export function useOutbox(): OutboxEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
