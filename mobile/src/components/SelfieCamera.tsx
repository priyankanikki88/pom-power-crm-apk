import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, space } from '../theme';

/**
 * A full-screen live camera for attendance: the front camera for a selfie, the back one for a site photo. Only a photo
 * taken here, now, can be used — there is no gallery option.
 */
export function SelfieCamera({ visible, facing = 'front', title, onCancel, onTaken }: { visible: boolean; facing?: 'front' | 'back'; title: string; onCancel: () => void; onTaken: (uri: string, takenAt: Date) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take() {
    if (!camera.current) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.8, exif: false });
      if (photo?.uri) onTaken(photo.uri, new Date());
      else setError('The photo could not be taken. Try again.');
    } catch {
      setError('The photo could not be taken. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.screen}>
        <Text style={styles.title}>{title}</Text>
        {!permission ? (
          <ActivityIndicator color="#fff" style={styles.flex} />
        ) : !permission.granted ? (
          <View style={[styles.flex, styles.center]}>
            <Text style={styles.msg}>Camera permission is needed for the attendance {facing === 'front' ? 'selfie' : 'photo'}.</Text>
            <Pressable style={styles.btn} accessibilityRole="button" onPress={() => void (permission.canAskAgain ? requestPermission() : Linking.openSettings())}>
              <Text style={styles.btnText}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView ref={camera} style={styles.flex} facing={facing} mirror={facing === 'front'} />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.bar}>
          <Pressable style={[styles.btn, styles.secondary]} accessibilityRole="button" onPress={onCancel}>
            <Text style={styles.btnText}>Cancel</Text>
          </Pressable>
          {permission?.granted ? (
            <Pressable style={[styles.shutter, busy && styles.dim]} accessibilityRole="button" accessibilityLabel="Take photo" disabled={busy} onPress={() => void take()}>
              {busy ? <ActivityIndicator color={colors.navy} /> : null}
            </Pressable>
          ) : null}
          <View style={styles.spacer} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', paddingTop: space.xl, paddingBottom: space.md },
  msg: { color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: space.lg },
  error: { color: '#ffb4ab', textAlign: 'center', padding: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.xl },
  btn: { paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 10, backgroundColor: colors.primary },
  secondary: { backgroundColor: '#333' },
  btnText: { color: '#fff', fontWeight: '700' },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', borderWidth: 4, borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
  spacer: { width: 80 },
});
