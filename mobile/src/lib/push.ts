import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Push notifications: the CRM's alerts on the phone even when the app is closed. The phone gets a Firebase device token
 * and tells the server; the server pushes every new notification for the signed-in user to it.
 *
 * Everything here is best-effort and silent. It does nothing — and the app works as before, with the in-app list — when
 * the app was built without the company's Firebase file, the user refuses notifications, or the server is not set up yet.
 */

// A push that arrives while the app is open is still shown as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registeredToken: string | null = null;

const within = <T>(ms: number, p: Promise<T>): Promise<T | null> => Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/** After sign-in: ask for permission (Android 13+ shows the system prompt once) and register this phone with the server. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    // Android asks for the permission only once a channel exists.
    await Notifications.setNotificationChannelAsync('default', { name: 'CRM alerts', importance: Notifications.AndroidImportance.HIGH });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;
    const token = await within(15_000, Notifications.getDevicePushTokenAsync());
    if (!token || typeof token.data !== 'string') return;
    await api.post('/notifications/devices', { token: token.data, platform: 'android' });
    registeredToken = token.data;
  } catch {
    // No Firebase in this build, or a server without push: the in-app notifications still work.
  }
}

/** At sign-out, while the session is still valid: stop pushing this user's notifications to this phone. */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await api.post('/notifications/devices/remove', { token });
  } catch {
    // The server forgets the phone anyway when the next user signs in on it.
  }
}
