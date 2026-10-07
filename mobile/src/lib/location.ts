import * as Location from 'expo-location';

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
