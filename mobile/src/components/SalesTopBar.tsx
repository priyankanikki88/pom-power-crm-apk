import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { brand } from '../theme';

type Tab = 'home' | 'attendance' | 'profile';

/**
 * The Sales Person Dashboard / Home screens' own top bar (Home · Attendance · Profile) — styled after the POM POWER
 * brand mark, distinct from the app's usual navy stack header, which both screens hide (headerShown: false).
 */
export function SalesTopBar({ active }: { active: Tab }) {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { user, logout } = useAuth();

  function onProfile() {
    Alert.alert(user?.fullName ?? 'Profile', user?.email ?? undefined, [
      { text: 'Sign Out', style: 'destructive', onPress: () => void logout() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.bar}>
      <Pressable style={[styles.item, styles.pill, active === 'home' && styles.pillActive]} onPress={() => navigation.navigate('SalesHome')} accessibilityRole="button" accessibilityLabel="Home">
        <Text style={[styles.icon, active === 'home' ? styles.iconActive : styles.iconOn]}>⌂</Text>
        <Text style={[styles.label, active === 'home' ? styles.labelActive : styles.labelOn]}>Home</Text>
      </Pressable>
      <Pressable style={styles.item} onPress={() => navigation.navigate('Attendance')} accessibilityRole="button" accessibilityLabel="Attendance">
        <Text style={styles.iconOn}>▤</Text>
        <Text style={styles.labelOn}>Attendance</Text>
      </Pressable>
      <Pressable style={styles.item} onPress={onProfile} accessibilityRole="button" accessibilityLabel="Profile">
        <Text style={styles.iconOn}>◉</Text>
        <Text style={styles.labelOn}>Profile</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: brand.blue, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  item: { alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4 },
  pill: { backgroundColor: 'transparent', borderRadius: 10, flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  pillActive: { backgroundColor: '#ffffff' },
  icon: { fontSize: 18, lineHeight: 20 },
  iconOn: { fontSize: 18, lineHeight: 20, color: '#ffffff' },
  iconActive: { fontSize: 16, lineHeight: 18, color: brand.blue },
  label: { fontSize: 13, fontWeight: '700' },
  labelOn: { fontSize: 11.5, fontWeight: '600', color: '#ffffff' },
  labelActive: { fontSize: 13, fontWeight: '700', color: brand.blue },
});
