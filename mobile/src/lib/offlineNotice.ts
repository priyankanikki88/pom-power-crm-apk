import { Alert } from 'react-native';

/** Told once, right after an entry could not reach the server and was kept on the phone instead. */
export function savedOnPhoneAlert(): void {
  Alert.alert('Saved on this phone', 'There is no network right now. It will be sent on its own when the network is back — see More → Waiting to Send. Until then this screen still shows the record as the server last had it.');
}

/** "Start work", "Put on hold" … from a route's last segment, for the Waiting to Send list. */
export function actionTitle(action: string): string {
  const words = action.replace(/[-_]/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Update';
}
