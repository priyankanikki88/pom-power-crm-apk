import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Row, text } from '../components/ui';
import { API_BASE } from '../config';
import type { MoreStackParams } from '../navigation';
import { useOutbox } from '../lib/outbox';
import { useUnreadNotifications } from './NotificationsScreen';
import { colors, space } from '../theme';

const APP_VERSION = '1.3.0';

/** Profile and sign-out. Administration stays on the web CRM by design — this app is for sales and service work. */
export function MoreScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'MoreHome'>) {
  const { user, logout, hasPermission } = useAuth();
  const [busy, setBusy] = useState(false);
  const unread = useUnreadNotifications();
  const waiting = useOutbox();

  function confirmLogout() {
    const lost = waiting.length > 0 ? `\n\n${waiting.length} ${waiting.length === 1 ? 'entry' : 'entries'} saved on this phone ${waiting.length === 1 ? 'has' : 'have'} not been sent yet and will be lost.` : '';
    Alert.alert('Sign out?', `You will need your email and password to sign in again.${lost}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void logout().finally(() => setBusy(false));
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <Card>
        <Text style={text.h1}>{user?.fullName}</Text>
        <Text style={[text.muted, styles.sub]}>{user?.email}</Text>
        <Row label="Role" value={user?.userRoles?.map((r) => r.role.name).join(', ')} />
        <Row label="Designation" value={user?.designation?.name} />
        <Row label="Department" value={user?.department?.name} />
        <Row label="Branch" value={user?.branch?.name} />
      </Card>
      <View style={styles.link}>
        <Button title={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'} variant={unread > 0 ? 'primary' : 'secondary'} onPress={() => navigation.navigate('Notifications')} />
      </View>
      {waiting.length > 0 ? (
        <View style={styles.link}>
          <Button title={`Waiting to Send (${waiting.length})`} onPress={() => navigation.navigate('Outbox')} />
        </View>
      ) : null}
      <View style={styles.link}>
        <Button title="Attendance" variant="secondary" onPress={() => navigation.navigate('Attendance')} />
      </View>
      {hasPermission('attendance.manage') ? (
        <View style={styles.link}>
          <Button title="Team Attendance" variant="secondary" onPress={() => navigation.navigate('AttendanceBoard')} />
        </View>
      ) : null}
      <View style={styles.link}>
        <Button title="Leave" variant="secondary" onPress={() => navigation.navigate('Leave')} />
      </View>
      <View style={styles.link}>
        <Button title="Tasks" variant="secondary" onPress={() => navigation.navigate('Tasks')} />
      </View>
      <View style={styles.link}>
        <Button title="My Expenses" variant="secondary" onPress={() => navigation.navigate('Expenses')} />
      </View>
      {hasPermission('target.read') ? (
        <View style={styles.link}>
          <Button title="Targets" variant="secondary" onPress={() => navigation.navigate('Targets')} />
        </View>
      ) : null}
      {hasPermission('tour.manage') ? (
        <View style={styles.link}>
          <Button title="Tour / Meeting Plans" variant="secondary" onPress={() => navigation.navigate('Tours')} />
        </View>
      ) : null}
      {hasPermission('meeting.read') ? (
        <View style={styles.link}>
          <Button title="Meetings & Action Items" variant="secondary" onPress={() => navigation.navigate('Meetings')} />
        </View>
      ) : null}
      {hasPermission('order.read') || hasPermission('dispatch.read') ? (
        <View style={styles.link}>
          <Button title="Orders & Dispatch" variant="secondary" onPress={() => navigation.navigate('Orders')} />
        </View>
      ) : null}
      <Card>
        <Text style={[text.h2, styles.section]}>About</Text>
        <Row label="App version" value={APP_VERSION} />
        <Row label="Server" value={API_BASE.replace(/^https?:\/\//, '').replace(/\/api\/v1$/, '')} />
        <Text style={[text.muted, styles.note]}>Without a network the app shows what it loaded in the last 7 days. Users, roles, settings and other administration are done on the web CRM.</Text>
      </Card>
      <Button title="Sign Out" variant="danger" onPress={confirmLogout} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  sub: { marginTop: 2, marginBottom: space.md },
  section: { marginBottom: space.sm },
  note: { marginTop: space.md },
  link: { marginBottom: space.md },
});
