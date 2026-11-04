import FaceDetection from '@react-native-ml-kit/face-detection';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { DeviceSecurity } from '../../modules/pom-device-security';
import { api, ApiError, postFiles } from './api';
import { readJson, writeJson } from './store';

/**
 * Verified attendance on the phone: a registered phone (Android Keystore key, at most two per employee), a fresh GPS fix,
 * a live selfie, and a punch signed by the phone so the server knows it came from this phone with this photo at this
 * place. With no network the punch is signed, its photo encrypted, and it waits here until it can be sent; the server
 * then sends it to an approver. Every rule is decided by the server — this file only collects and signs the evidence.
 */

export type PunchMode = 'OFFICE' | 'WFH' | 'FIELD_GENERAL' | 'FIELD_CUSTOMER' | 'TOUR';
export type PunchType = 'IN' | 'OUT';
export type Verification = 'VERIFIED' | 'PENDING' | 'FLAGGED' | 'REJECTED';

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  fixAt: Date;
  mocked: boolean | null;
  /** The Wi-Fi access point the phone was on at that moment (office Wi-Fi check), when Android lets the app read it. */
  wifiBssid: string | null;
  wifiName: string | null;
}

export interface Photo {
  uri: string;
  sha256: string;
  faces: number | null;
  capturedAt: Date;
}

export interface PunchDetails {
  type: PunchType;
  mode: PunchMode;
  reason?: string;
  acceptPending?: boolean;
  customerId?: string;
  leadId?: string;
  /** A service engineer's visit for one of their tickets (the server takes the customer from the ticket). */
  serviceTicketId?: string;
  purpose?: string;
  visitLocation?: string;
  notes?: string;
  outcome?: string;
}

export interface PunchResult {
  replayed: boolean;
  punch: { id: string; type: PunchType; mode: PunchMode; serverAt: string; verification: Verification; distanceM: number | null; accuracyM: number | null; checks: Array<{ code: string; result: string; detail: string }> };
  exception: { id: string; status: string; type: string } | null;
}

export class PunchError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** The server's refusal (code + whether a retry may work), or a plain message. */
export function refusalOf(err: unknown): PunchError {
  if (err instanceof PunchError) return err;
  if (err instanceof ApiError) {
    const body = (err.body ?? {}) as { code?: string; retryable?: boolean };
    return new PunchError(err.message, body.code ?? null, Boolean(body.retryable));
  }
  return new PunchError(err instanceof Error ? err.message : 'Something went wrong.');
}

export const isSupported = () => Platform.OS === 'android' && DeviceSecurity !== null;

// ---------------------------------------------------------------- the registered phone

const keyAlias = (userId: string) => `pom_att_sign_u${userId}`;
const deviceKey = (userId: string) => `pom_att_device_u${userId}`;

/** This phone's registration for this employee: registers it (proving it holds the key) when it has none yet. */
export async function ensureRegistered(userId: string): Promise<string> {
  if (!DeviceSecurity) throw new PunchError('Verified attendance needs the POM POWER Android app.');
  const saved = await SecureStore.getItemAsync(deviceKey(userId));
  if (saved) return saved;
  const key = await DeviceSecurity.ensureSigningKey(keyAlias(userId));
  const { nonce } = await api.post<{ nonce: string }>('/attendance/challenge', { purpose: 'REGISTER' });
  const signature = await DeviceSecurity.sign(keyAlias(userId), ['POMATT1', 'REGISTER', nonce, key.publicKeySha256.toLowerCase()].join('|'));
  const constants = Platform.constants as { Model?: string; Manufacturer?: string; Brand?: string };
  try {
    const device = await api.post<{ id: string }>('/attendance/devices', {
      publicKey: key.publicKey,
      nonce,
      signature,
      platform: 'ANDROID',
      model: [constants.Manufacturer ?? constants.Brand, constants.Model].filter(Boolean).join(' ').slice(0, 100) || undefined,
      osVersion: `Android ${String(Platform.Version)}`,
      appVersion: Constants.expoConfig?.version,
    });
    await SecureStore.setItemAsync(deviceKey(userId), String(device.id));
    return String(device.id);
  } catch (err) {
    const r = refusalOf(err);
    // A revoked or foreign key is useless: start this phone over with a new key (it then needs a free slot again).
    if (r.code === 'DEVICE_REVOKED' || r.code === 'DEVICE_KEY_TAKEN') await forgetPhone(userId);
    throw r;
  }
}

/** Drops this phone's key and registration for the employee (after it was revoked, or on request). */
export async function forgetPhone(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(deviceKey(userId));
  await DeviceSecurity?.deleteKey(keyAlias(userId));
}

// ---------------------------------------------------------------- location and selfie

/** A fresh high-accuracy fix (never a cached one), with the phone's own mock-location report. */
export async function freshFix(): Promise<Fix> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new PunchError('Location permission is needed. Allow it in Settings → Apps → POM POWER CRM → Permissions.', 'GPS_PERMISSION');
  if (!(await Location.hasServicesEnabledAsync())) throw new PunchError('Location (GPS) is switched off. Turn it on and try again.', 'GPS_OFF', true);
  const pos = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
  ]);
  if (!pos) throw new PunchError('The phone could not find its location in time. Move outdoors or near a window and try again.', 'GPS_TIMEOUT', true);
  const wifi = await DeviceSecurity?.wifiInfo().catch(() => null);
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    fixAt: new Date(pos.timestamp),
    mocked: typeof pos.mocked === 'boolean' ? pos.mocked : null,
    wifiBssid: wifi?.bssid ?? null,
    wifiName: wifi?.ssid ?? null,
  };
}

/** A camera photo made ready to send: ≤ 720 px wide JPEG (no EXIF), its hash, and how many faces the phone sees in it. */
export async function preparePhoto(uri: string, capturedAt: Date, detectFaces: boolean): Promise<Photo> {
  if (!DeviceSecurity) throw new PunchError('Verified attendance needs the POM POWER Android app.');
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: 720 }).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  let faces: number | null = null;
  if (detectFaces) {
    try {
      faces = (await FaceDetection.detect(saved.uri, { performanceMode: 'fast', minFaceSize: 0.15 })).length;
    } catch {
      faces = null; // detection is a signal for the approver, never a reason to stop the punch
    }
  }
  return { uri: saved.uri, sha256: await DeviceSecurity.sha256File(saved.uri), faces, capturedAt };
}

// ---------------------------------------------------------------- signing and sending

/** The exact string the server rebuilds and verifies (see backend punch-rules.ts canonicalPunchPayload). */
function canonical(p: { nonce: string | null; eventUuid: string; type: PunchType; mode: PunchMode; latitude: number; longitude: number; accuracy: number | null; capturedAt: Date; sha256: string; wifiBssid: string | null }) {
  const fields = [
    'POMATT1',
    'PUNCH',
    p.nonce ?? '-',
    p.eventUuid.toLowerCase(),
    p.type,
    p.mode,
    p.latitude.toFixed(7),
    p.longitude.toFixed(7),
    p.accuracy === null ? '-' : String(Math.round(p.accuracy)),
    p.capturedAt.toISOString(),
    p.sha256.toLowerCase(),
  ];
  // The Wi-Fi access point is signed too, when there is one (it then cannot be swapped for the office's).
  if (p.wifiBssid) fields.push(p.wifiBssid.toLowerCase());
  return fields.join('|');
}

function newUuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface SignedPunch {
  eventUuid: string;
  fields: Record<string, string | undefined>;
  selfieUri: string;
  sitePhotoUri: string | null;
}

async function sign(userId: string, deviceId: string, nonce: string | null, details: PunchDetails, fix: Fix, selfie: Photo, sitePhoto: Photo | null, eventUuid: string): Promise<SignedPunch> {
  const signature = await DeviceSecurity!.sign(keyAlias(userId), canonical({ nonce, eventUuid, type: details.type, mode: details.mode, latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, capturedAt: selfie.capturedAt, sha256: selfie.sha256, wifiBssid: fix.wifiBssid }));
  return {
    eventUuid,
    selfieUri: selfie.uri,
    sitePhotoUri: sitePhoto?.uri ?? null,
    fields: {
      eventUuid,
      type: details.type,
      mode: details.mode,
      channel: nonce ? 'MOBILE' : 'MOBILE_OFFLINE',
      nonce: nonce ?? undefined,
      deviceId,
      signature,
      latitude: String(fix.latitude),
      longitude: String(fix.longitude),
      accuracy: fix.accuracy === null ? undefined : String(fix.accuracy),
      fixAt: fix.fixAt.toISOString(),
      capturedAt: selfie.capturedAt.toISOString(),
      mocked: fix.mocked === null ? undefined : String(fix.mocked),
      wifiBssid: fix.wifiBssid ?? undefined,
      facesDetected: selfie.faces === null ? undefined : String(selfie.faces),
      reason: details.reason?.trim() || undefined,
      acceptPending: details.acceptPending ? 'true' : undefined,
      customerId: details.customerId,
      leadId: details.leadId,
      serviceTicketId: details.serviceTicketId,
      purpose: details.purpose?.trim() || undefined,
      visitLocation: details.visitLocation?.trim() || undefined,
      notes: details.notes?.trim() || undefined,
      outcome: details.outcome?.trim() || undefined,
    },
  };
}

const send = (p: SignedPunch, selfieUri = p.selfieUri, siteUri = p.sitePhotoUri) =>
  postFiles<PunchResult>('/attendance/punch', p.fields, [
    { field: 'selfie', uri: selfieUri, name: 'selfie.jpg', type: 'image/jpeg' },
    ...(siteUri ? [{ field: 'sitePhoto', uri: siteUri, name: 'site.jpg', type: 'image/jpeg' }] : []),
  ]);

/**
 * Sends a verified punch. Online: a fresh server code is signed into it. No network: it is signed for offline use,
 * encrypted and queued (returns `queued: true`); it is sent later and waits for an approver.
 */
export async function punch(userId: string, details: PunchDetails, fix: Fix, selfie: Photo, sitePhoto: Photo | null): Promise<{ queued: false; result: PunchResult } | { queued: true }> {
  const deviceId = await ensureRegistered(userId);
  const eventUuid = newUuid();
  let nonce: string;
  try {
    nonce = (await api.post<{ nonce: string }>('/attendance/challenge', { purpose: 'PUNCH' })).nonce;
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      await enqueue(userId, await sign(userId, deviceId, null, details, fix, selfie, sitePhoto, eventUuid));
      return { queued: true };
    }
    throw refusalOf(err);
  }
  const signed = await sign(userId, deviceId, nonce, details, fix, selfie, sitePhoto, eventUuid);
  try {
    return { queued: false, result: await send(signed) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) {
      // The network dropped after the code was issued: the same capture goes into the offline queue, re-signed without it.
      await enqueue(userId, await sign(userId, deviceId, null, details, fix, selfie, sitePhoto, eventUuid));
      return { queued: true };
    }
    const r = refusalOf(err);
    if (r.code === 'DEVICE_REVOKED' || r.code === 'DEVICE_NOT_REGISTERED') await forgetPhone(userId);
    throw r;
  }
}

// ---------------------------------------------------------------- offline queue (encrypted photos)

const QUEUE_FILE = 'attendance-punch-queue';
const queueDir = () => new Directory(Paths.document, 'attendance-queue');

export interface QueuedPunch {
  userId: string;
  eventUuid: string;
  fields: Record<string, string | undefined>;
  selfieEnc: string;
  siteEnc: string | null;
  queuedAt: string;
  lastError: string | null;
  /** The server refused it (not a network problem): kept for the user to see, not sent again. */
  failed: boolean;
}

export async function queuedPunches(userId: string): Promise<QueuedPunch[]> {
  return ((await readJson<QueuedPunch[]>(QUEUE_FILE)) ?? []).filter((q) => q.userId === userId);
}

async function encryptInto(uri: string, name: string): Promise<string> {
  const dir = queueDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const out = new File(dir, name);
  await DeviceSecurity!.encryptFile(uri, out.uri);
  try {
    new File(uri).delete();
  } catch {
    // the plain copy lives in the cache; the system clears it anyway
  }
  return out.uri;
}

async function enqueue(userId: string, p: SignedPunch) {
  const selfieEnc = await encryptInto(p.selfieUri, `${p.eventUuid}-selfie.enc`);
  const siteEnc = p.sitePhotoUri ? await encryptInto(p.sitePhotoUri, `${p.eventUuid}-site.enc`) : null;
  const all = (await readJson<QueuedPunch[]>(QUEUE_FILE)) ?? [];
  all.push({ userId, eventUuid: p.eventUuid, fields: p.fields, selfieEnc, siteEnc, queuedAt: new Date().toISOString(), lastError: null, failed: false });
  writeJson(QUEUE_FILE, all);
}

function removeFiles(...uris: Array<string | null>) {
  for (const u of uris) {
    if (!u) continue;
    try {
      const f = new File(u);
      if (f.exists) f.delete();
    } catch {
      // already gone
    }
  }
}

let flushing = false;

/** Sends every queued punch of this employee (oldest first). Network problems leave them queued; refusals are kept, marked failed. */
export async function flushPunchQueue(userId: string): Promise<number> {
  if (flushing || !DeviceSecurity) return 0;
  flushing = true;
  let sent = 0;
  try {
    const all = (await readJson<QueuedPunch[]>(QUEUE_FILE)) ?? [];
    for (const q of all.filter((x) => x.userId === userId && !x.failed)) {
      const plainSelfie = new File(Paths.cache, `${q.eventUuid}-selfie.jpg`);
      const plainSite = q.siteEnc ? new File(Paths.cache, `${q.eventUuid}-site.jpg`) : null;
      try {
        await DeviceSecurity.decryptFile(q.selfieEnc, plainSelfie.uri);
        if (q.siteEnc && plainSite) await DeviceSecurity.decryptFile(q.siteEnc, plainSite.uri);
        await send({ eventUuid: q.eventUuid, fields: q.fields, selfieUri: plainSelfie.uri, sitePhotoUri: plainSite?.uri ?? null });
        removeFiles(q.selfieEnc, q.siteEnc);
        all.splice(all.indexOf(q), 1);
        sent += 1;
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) break;
        q.failed = true;
        q.lastError = refusalOf(err).message;
      } finally {
        removeFiles(plainSelfie.uri, plainSite?.uri ?? null);
      }
      writeJson(QUEUE_FILE, all);
    }
  } finally {
    flushing = false;
  }
  return sent;
}

/** Removes a refused queued punch the user has seen (its encrypted photos too). */
export async function discardQueued(eventUuid: string): Promise<void> {
  const all = (await readJson<QueuedPunch[]>(QUEUE_FILE)) ?? [];
  const q = all.find((x) => x.eventUuid === eventUuid);
  if (!q) return;
  removeFiles(q.selfieEnc, q.siteEnc);
  writeJson(QUEUE_FILE, all.filter((x) => x !== q));
}
