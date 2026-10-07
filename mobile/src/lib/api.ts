import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '../config';

const ACCESS_KEY = 'pom_access_token';
const REFRESH_KEY = 'pom_refresh_token';

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Tokens live in the device keystore (expo-secure-store) and are mirrored in memory so every request doesn't hit it.
let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

/** Called by the auth layer: what to do when the server no longer accepts this device's session. */
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

/** Called whenever the server answers a request — the moment to send anything that was waiting for a connection. */
let onOnline: (() => void) | null = null;
export function setOnlineListener(fn: (() => void) | null): void {
  onOnline = fn;
}

export async function loadTokens(): Promise<boolean> {
  accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return accessToken !== null;
}

export async function setTokens(tokens: { accessToken: string; refreshToken: string } | null): Promise<void> {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
  if (tokens) {
    await SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  } else {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}

export const currentRefreshToken = () => refreshToken;

/** The server records which kind of client a session came from (the web app sends "web" / "app"). */
const CLIENT = 'app';

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client': CLIENT },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        await setTokens((await res.json()) as { accessToken: string; refreshToken: string });
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `${path}?${parts.join('&')}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Client': CLIENT, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No internet connection, or the server could not be reached.');
  }
  onOnline?.();

  if (res.status === 401 && retry && refreshToken) {
    if (await tryRefresh()) return request<T>(method, path, body, false);
    await setTokens(null);
    onSessionExpired?.();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const raw = typeof payload === 'object' && payload && 'message' in payload ? (payload as { message: unknown }).message : res.statusText;
    throw new ApiError(res.status, Array.isArray(raw) ? raw.join('\n') : String(raw || 'Request failed'), payload);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', withQuery(path, query)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/**
 * Downloads a file-returning endpoint (a document PDF) into the app's cache with the user's token and returns its local
 * URI. The cache is the OS-managed temp area: nothing is written to shared storage unless the user then shares / saves it.
 */
export async function downloadToCache(path: string, fileName: string): Promise<string> {
  const destination = new File(Paths.cache, fileName);
  const attempt = () =>
    File.downloadFileAsync(`${API_BASE}${path}`, destination, { idempotent: true, headers: { 'X-Client': CLIENT, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) } });
  try {
    return (await attempt()).uri;
  } catch {
    // The usual reason is an access token that expired while the app sat open: refresh once and try again.
    if (refreshToken && (await tryRefresh())) {
      try {
        return (await attempt()).uri;
      } catch {
        // fall through to the error below
      }
    }
    throw new ApiError(0, 'Could not download the document. Check your connection and that your role may open it.');
  }
}

/**
 * Uploads one local file (a photo from the camera or gallery) as multipart form data, with any extra text fields. React
 * Native's FormData takes a file as { uri, name, type }; the Content-Type header (with its boundary) is left to fetch.
 */
export async function uploadFile<T>(path: string, file: { uri: string; name: string; type: string }, fields: Record<string, string | undefined> = {}, retry = true): Promise<T> {
  const form = new FormData();
  form.append('file', file as unknown as Blob);
  for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'X-Client': CLIENT, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: form });
  } catch {
    throw new ApiError(0, 'No internet connection, or the server could not be reached.');
  }
  if (res.status === 401 && retry && refreshToken && (await tryRefresh())) return uploadFile<T>(path, file, fields, false);
  const contentType = res.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const raw = typeof payload === 'object' && payload && 'message' in payload ? (payload as { message: unknown }).message : res.statusText;
    throw new ApiError(res.status, Array.isArray(raw) ? raw.join('\n') : String(raw || 'Upload failed'), payload);
  }
  return payload as T;
}
