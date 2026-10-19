import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bars } from '../components/charts';
import { Badge, Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { enumLabel } from '../lib/format';
import { colors, space } from '../theme';

interface AttendanceOverview {
  totalEmployees: number;
  present: number;
  absent: number;
  onLeave: number;
  byDepartment: Array<{ department: string; count: number }>;
  recent: Array<{ name: string; department: string | null; status: string }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const STATUS_TONE: Record<string, string> = { PRESENT: colors.success, LATE: colors.warning, WFH: colors.success, ON_DUTY: colors.success, ABSENT: colors.danger, LEAVE: colors.warning, HOLIDAY: colors.muted };

/** Today's attendance, company-wide. */
export function MdAttendanceOverviewScreen() {
  const q = useQuery({ queryKey: ['md', 'attendance-overview'], queryFn: () => api.get<AttendanceOverview>('/dashboard/md/attendance-overview') });
  const d = q.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load attendance.')} /> : null}

      {d ? (
        <View style={styles.statGrid}>
          <Stat label="Total Employees" value={String(d.totalEmployees)} />
          <Stat label="Present" value={String(d.present)} tone={colors.success} />
          <Stat label="Absent" value={String(d.absent)} tone={colors.danger} />
          <Stat label="On Leave" value={String(d.onLeave)} tone={colors.warning} />
        </View>
      ) : null}

      {d && d.byDepartment.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Department Wise Attendance</Text>
          <Bars rows={d.byDepartment.map((r) => ({ key: r.department, label: r.department, value: r.count }))} />
        </Card>
      ) : null}

      {d && d.recent.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Recent Attendance</Text>
          {d.recent.map((r, i) => (
            <View key={`${r.name}-${i}`} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{r.name}</Text>
                {r.department ? <Text style={text.muted}>{r.department}</Text> : null}
              </View>
              <Badge value={r.status} label={enumLabel(r.status)} />
            </View>
          ))}
        </Card>
      ) : null}

      {d && d.totalEmployees === 0 ? <Empty title="No active employees" /> : null}
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  cardTitle: { marginBottom: space.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  statCard: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: space.sm },
  flex: { flex: 1 },
  name: { fontSize: 13.5, fontWeight: '600', color: colors.text },
});
