import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { ApiError, downloadToCache, uploadFile } from '../lib/api';
import { colors, radius, space } from '../theme';
import { Button, ErrorBox, Field } from './ui';

/** A photo that sits behind the login: downloaded once into the app cache with the user's token, then shown from there. */
export function AuthImage({ path, cacheName }: { path: string; cacheName: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    downloadToCache(path, cacheName)
      .then((u) => live && setUri(u))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [path, cacheName]);
  if (failed) return <View style={[styles.thumb, styles.center]}><Text style={styles.muted}>Photo not available</Text></View>;
  if (!uri) return <View style={[styles.thumb, styles.center]}><ActivityIndicator color={colors.primary} /></View>;
  return <Image source={{ uri }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />;
}

/**
 * Take a photo or pick one from the gallery and upload it to `uploadPath` (multipart "file", plus an optional caption).
 * Photos are sent at reduced quality — a site photo does not need the camera's full size, and mobile data is slow.
 */
export function PhotoAdder({ uploadPath, withCaption, onUploaded }: { uploadPath: string; withCaption?: boolean; onUploaded: () => void }) {
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: 'camera' | 'gallery') {
    setError(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return setError('Camera permission was not given. Allow it in the phone settings to take photos.');
      }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.6 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.6 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setBusy(true);
      await uploadFile(uploadPath, { uri: asset.uri, name: asset.fileName ?? `photo-${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg' }, withCaption ? { caption: caption.trim() || undefined } : {});
      setCaption('');
      onUploaded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.adder}>
      {error ? <ErrorBox message={error} /> : null}
      {withCaption ? <Field label="Caption for the next photo (optional)" value={caption} onChangeText={setCaption} maxLength={200} /> : null}
      {busy ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Uploading…</Text>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button title="Take Photo" variant="secondary" onPress={() => void pick('camera')} />
          </View>
          <View style={styles.flex}>
            <Button title="From Gallery" variant="secondary" onPress={() => void pick('gallery')} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  adder: { marginTop: space.md },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.sm },
  thumb: { width: '100%', height: 190, borderRadius: radius.md, backgroundColor: '#eef1f6' },
  muted: { fontSize: 12.5, color: colors.muted },
});
