import { requireOptionalNativeModule } from 'expo';

export interface PublicKeyInfo {
  /** base64 SubjectPublicKeyInfo (DER) of the EC P-256 key. */
  publicKey: string;
  publicKeySha256: string;
  created: boolean;
  /** true when the key lives in secure hardware (TEE / StrongBox); null when the phone does not say. */
  hardwareBacked: boolean | null;
}

interface NativeModule {
  ensureSigningKey(alias: string): Promise<PublicKeyInfo>;
  getPublicKey(alias: string): Promise<PublicKeyInfo | null>;
  sign(alias: string, payload: string): Promise<string>;
  deleteKey(alias: string): Promise<void>;
  sha256File(uri: string): Promise<string>;
  encryptFile(inUri: string, outUri: string): Promise<void>;
  decryptFile(inUri: string, outUri: string): Promise<void>;
  /** The connected Wi-Fi access point, or null (not on Wi-Fi, or Android hides it). */
  wifiInfo(): Promise<{ bssid: string; ssid: string | null } | null>;
}

/**
 * The app's Android Keystore module (modules/pom-device-security/android). Null where it is not built in (iOS, Expo Go):
 * verified attendance then asks the user to use the Android app.
 */
export const DeviceSecurity = requireOptionalNativeModule<NativeModule>('PomDeviceSecurity');
