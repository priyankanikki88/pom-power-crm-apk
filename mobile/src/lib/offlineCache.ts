import type { QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { readJson, removeJson, writeJson } from './store';

const FILE = 'saved-data';
/** How long data seen on the phone stays readable without a network. */
export const SAVED_DATA_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Keeps what the screens have loaded (lists, opened records, Home figures) in a file, so the app shows it again when it
 * is opened without a network. Written at most once every few seconds — the lists change with every scroll and search.
 */
let timer: ReturnType<typeof setTimeout> | null = null;
let latest: PersistedClient | null = null;
function forget() {
  latest = null;
  if (timer) clearTimeout(timer);
  timer = null;
  removeJson(FILE);
}

export function createFilePersister(): Persister {
  return {
    persistClient: (client) => {
      latest = client;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (latest) writeJson(FILE, latest);
      }, 3000);
    },
    restoreClient: async () => (await readJson<PersistedClient>(FILE)) ?? undefined,
    removeClient: forget,
  };
}

/** Search-as-you-type results are not worth keeping: every keystroke is its own entry. */
export const shouldSaveQuery = (queryKey: readonly unknown[]) => !queryKey.includes('picker');

/** Forgets everything loaded for the user who was signed in — in memory and on the phone. */
export function clearSavedData(qc: QueryClient): void {
  qc.clear();
  forget();
}
