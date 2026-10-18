import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, Row, text } from '../components/ui';
import { api } from '../lib/api';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

interface ServiceMe {
  coordinator: boolean;
  engineerId: string | null;
  territory: string | null;
}
interface AttendanceDay {
  date: string;
  status: string;
}

/** The signed-in engineer's own profile and a quick look at their history — editing stays on the web CRM. */
export function ServiceEngineerProfileScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const me = useQuery({ queryKey: ['service', 'me'], queryFn: () => api.get<ServiceMe>('/service/me') });
  const completed = useQuery({ queryKey: ['service-tickets', 'completed-count'], queryFn: () => api.get<Paginated<unknown>>('/service-tickets', { status: 'CLOSED', pageSize: 1 }) });
  const attendance = useQuery({ queryKey: ['attendance', 'month'], queryFn: () => api.get<AttendanceDay[]>('/attendance/month') });
  const days = attendance.data ?? [];
  const present = days.filter((d) => ['PRESENT', 'WFH', 'OD'].includes(d.status)).length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={me.isRefetching || completed.isRefetching || attendance.isRefetching}
          onRefresh={() => {
            void me.refetch();
            void completed.refetch();
            void attendance.refetch();
          }}
        />
      }
    >
      <Card>
        <View style={styles.head}>
          <Text style={[text.h1, styles.flex]}>{user?.fullName}</Text>
        </View>
        <Text style={text.muted}>Service Engineer{user?.employeeCode ? ` · Emp ID: ${user.employeeCode}` : ''}</Text>
        <Row label="Branch" value={user?.branch?.name} />
        <Row label="Reporting Manager" value={user?.reportingManager?.fullName} />
        <Row label="Contact" value={user?.phone} />
        <Row label="Email" value={user?.email} />
        {me.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.sm }} /> : null}
        <Row label="Service Territory" value={me.data?.territory} />
      </Card>

      <Text style={[text.h2, styles.section]}>My History</Text>
      <Card>
        <Row label="Completed Jobs" value={completed.data ? String(completed.data.total) : undefined} />
        <Row label="Attendance This Month" value={attendance.data ? `${present} / ${days.length} days` : undefined} />
        <View style={styles.link}>
          <Button title="View Reports" variant="secondary" onPress={() => navigation.navigate('Reports')} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: 2 },
  section: { marginVertical: space.sm },
  link: { marginTop: space.sm },
});
