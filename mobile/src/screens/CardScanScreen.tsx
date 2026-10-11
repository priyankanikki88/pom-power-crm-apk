import { CameraView, useCameraPermissions } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { isCardEmpty, scanBusinessCard, type CardData } from '../lib/cardScan';
import type { MoreStackParams } from '../navigation';
import { colors, space } from '../theme';

/**
 * A live camera preview (not the system camera app) with a visiting-card guide and an in-app shutter — more reliable
 * than opening the OS camera, and lets a bad read be retried right away without leaving the screen. Reads the card
 * on the phone (no network) and hands the result back to whoever opened this screen.
 */
export function CardScanScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'CardScan'>) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function capture() {
    if (busy || !cameraRef.current) return;
    setNotice(null);
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo?.uri) throw new Error('no photo');
      const card: CardData = await scanBusinessCard(photo.uri);
      if (isCardEmpty(card)) {
        setNotice('No card text found. Keep the card flat, fill the frame, and use good light.');
        return;
      }
      route.params.onScanned(card);
      navigation.goBack();
    } catch {
      setNotice('Could not read the card. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!permission) return <View style={styles.screen} />;
  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.permissionText}>Camera permission is needed to scan a card.</Text>
        <View style={styles.gap} />
        <Button title="Allow Camera" onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" enableTorch={torch} />
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
      </View>
      <View style={styles.topBar}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.iconText}>Close</Text>
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setTorch((t) => !t)} hitSlop={10} accessibilityRole="button" accessibilityLabel={torch ? 'Turn off torch' : 'Turn on torch'}>
          <Text style={styles.iconText}>{torch ? '⚡ On' : '⚡ Off'}</Text>
        </Pressable>
      </View>
      <View style={styles.bottomBar}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : <Text style={styles.hint}>Keep the card inside the frame</Text>}
        <Pressable style={[styles.shutter, busy && styles.shutterBusy]} onPress={() => void capture()} disabled={busy} accessibilityRole="button" accessibilityLabel="Take photo">
          {busy ? <ActivityIndicator color="#ffffff" /> : <View style={styles.shutterDot} />}
        </Pressable>
      </View>
      {busy ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#ffffff" size="large" />
          <Text style={styles.overlayText}>Reading card...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  permissionText: { color: '#ffffff', fontSize: 15, textAlign: 'center' },
  gap: { height: space.md },
  camera: { flex: 1 },
  frameWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '86%', aspectRatio: 1.75, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 16 },
  topBar: { position: 'absolute', top: space.xl, left: space.lg, right: space.lg, flexDirection: 'row', justifyContent: 'space-between' },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingHorizontal: space.md, paddingVertical: space.sm },
  iconText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  bottomBar: { position: 'absolute', bottom: space.xl, left: 0, right: 0, alignItems: 'center', gap: space.md },
  hint: { color: '#ffffff', fontSize: 13.5, fontWeight: '600' },
  notice: { color: '#ffd166', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: space.xl },
  shutter: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)' },
  shutterBusy: { backgroundColor: colors.muted },
  shutterDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffffff' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  overlayText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
