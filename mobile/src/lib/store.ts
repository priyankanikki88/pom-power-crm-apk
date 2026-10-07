import { File, Paths } from 'expo-file-system';

/**
 * Small JSON files in the app's private storage (nothing another app can read, removed when the app is uninstalled). Used
 * for what must survive closing the app without a network: the last data seen, the signed-in user, entries waiting to be
 * sent. Every call is safe to make at any time — a missing or damaged file reads as "nothing saved".
 */
const file = (name: string) => new File(Paths.document, `${name}.json`);

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    const f = file(name);
    if (!f.exists) return null;
    return JSON.parse(await f.text()) as T;
  } catch {
    return null;
  }
}

export function writeJson(name: string, value: unknown): void {
  try {
    const f = file(name);
    if (!f.exists) f.create({ intermediates: true });
    f.write(JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the app keeps working from memory.
  }
}

export function removeJson(name: string): void {
  try {
    const f = file(name);
    if (f.exists) f.delete();
  } catch {
    // nothing to remove
  }
}
