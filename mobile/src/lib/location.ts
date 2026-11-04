import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api, ApiError } from './api';
import { readJson, removeJson, writeJson } from './store';

export interface PunchLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type LocationResult = { ok: true; location: PunchLocation } | { ok: false; reason: string };

/**
 * Where the phone is right now, for an attendance punch. Asks for the "while using the app" permission the first time.
 * Never throws: a refusal, location switched off, or no fix within the time limit comes back as a reason the screen can show.
 */
export async function getPunchLocation(): Promise<LocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'Location permission was not given.' };
    if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: 'Location (GPS) is switched off on this phone.' };
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);
    const position = fix ?? (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000 }));
    if (!position) return { ok: false, reason: 'The phone could not find its location in time.' };
    return { ok: true, location: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy ?? undefined } };
  } catch {
    return { ok: false, reason: 'The phone could not read its location.' };
  }
}

/**
 * Automatic background field tracking: "subah se shaam tak" — a GPS fix every few minutes while clocked in, with
 * nothing for the engineer to do. Started right after a successful punch-in, stopped right after punch-out — never
 * running the rest of the day. Builds the Day-wise Field Activity Report's route, stops and distance.
 */
const FIELD_TRACKING_TASK = 'field-location-tracking';
const PINGS_FILE = 'field-pings';
/** Matches the backend's POST /field-activity/pings batch limit. */
const MAX_BATCH = 200;

interface QueuedPing {
  latitude: number;
  longitude: number;
  accuracy?: number;
  occurredAt: string;
}

let queue: QueuedPing[] | null = null;

async function loadQueue(): Promise<QueuedPing[]> {
  if (queue === null) queue = (await readJson<QueuedPing[]>(PINGS_FILE)) ?? [];
  return queue;
}

function saveQueue(next: QueuedPing[]) {
  queue = next;
  writeJson(PINGS_FILE, next);
}

TaskManager.defineTask(FIELD_TRACKING_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const current = await loadQueue();
  saveQueue([
    ...current,
    ...locations.map((loc) => ({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined, occurredAt: new Date(loc.timestamp).toISOString() })),
  ]);
  await flushFieldPings();
});

/** Sends whatever is queued, oldest first, in batches of at most 200. Stops at the first failure and leaves the rest queued. */
export async function flushFieldPings(): Promise<void> {
  let pending = await loadQueue();
  while (pending.length > 0) {
    const batch = pending.slice(0, MAX_BATCH);
    try {
      const res = await api.post<{ stored: number; trackingDisabled?: boolean }>('/field-activity/pings', { pings: batch });
      // HR switched background tracking off for this employee: stop the trail and drop what is queued.
      if (res?.trackingDisabled) {
        saveQueue([]);
        try {
          if (await Location.hasStartedLocationUpdatesAsync(FIELD_TRACKING_TASK)) await Location.stopLocationUpdatesAsync(FIELD_TRACKING_TASK);
        } catch {
          // already stopped
        }
        return;
      }
    } catch (err) {
      // A bad batch (e.g. every ping unparsable) is dropped rather than retried forever; offline / server errors stay queued.
      if (!(err instanceof ApiError) || err.status === 0 || err.status >= 500) return;
    }
    pending = pending.slice(batch.length);
    saveQueue(pending);
  }
}

/** Discards anything still queued, unsent — called on sign-out so it is never sent attributed to whoever signs in next. */
export function clearFieldPings(): void {
  queue = [];
  removeJson(PINGS_FILE);
}

/** Starts the background trail for today. Safe to call repeatedly (a no-op once already running). Never blocks a punch-in. */
export async function startFieldTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(FIELD_TRACKING_TASK)) return;
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (!foreground.granted) return;
    // Lets tracking continue once the app is backgrounded. Without it, Android still delivers updates only while the
    // app is in the foreground — reduced coverage, never an error, so a refusal here is not treated as a failure.
    await Location.requestBackgroundPermissionsAsync();
    await Location.startLocationUpdatesAsync(FIELD_TRACKING_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5 * 60 * 1000,
      distanceInterval: 50,
      foregroundService: { notificationTitle: 'POM POWER CRM', notificationBody: "Recording your location for today's field activity report." },
    });
  } catch {
    // Tracking is a bonus on top of attendance, never a reason to fail the punch-in itself.
  }
}

/** Stops the background trail — called right after a successful punch-out. */
export async function stopFieldTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(FIELD_TRACKING_TASK)) await Location.stopLocationUpdatesAsync(FIELD_TRACKING_TASK);
  } catch {
    // ignore — nothing to stop, or the OS already stopped it
  }
  await flushFieldPings();
}
