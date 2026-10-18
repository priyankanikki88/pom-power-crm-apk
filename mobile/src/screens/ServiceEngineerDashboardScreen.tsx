import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '../components/inputs';
import { Card, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, radius, space } from '../theme';

type Period = 'today' | 'week' | 'month';
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

interface MyDashboard {
  totalAssigned: number;
  newComplaints: number;
  resolved: number;
  pendingVisits: number;
  inProgress: number;
  partsPending: number;
  reportsPending: number;
  visitedToday: number;
  assignedOpenNow: number;
  performancePct: number | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** The Service Engineer's own performance dashboard — the same numbers Reports draws on, by Today / Week / Month. */
export function ServiceEngineerDashboardScreen() {
  const [period, setPeriod] = useState<Period>('today');
  const q = useQuery({ queryKey: ['service', 'my-dashboard', period], queryFn: () => api.get<MyDashboard>('/service/my-dashboard', { period }) });
  const d = q.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Segmented value={period} options={PERIODS} onChange={setPeriod} />
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load your dashboard.')} /> : null}
      {d ? (
        <>
          <View style={styles.grid}>
            <Stat label="Total Assigned" value={d.totalAssigned} />
            <Stat label="New Complaints" value={d.newComplaints} />
            <Stat label="Pending Visits" value={d.pendingVisits} tone={d.pendingVisits > 0 ? colors.warning : undefined} />
            <Stat label="In Progress" value={d.inProgress} />
            <Stat label="Resolved" value={d.resolved} tone={colors.success} />
            <Stat label="Parts Pending" value={d.partsPending} tone={d.partsPending > 0 ? colors.warning : undefined} />
            <Stat label="Reports Pending" value={d.reportsPending} tone={d.reportsPending > 0 ? colors.danger : undefined} />
          </View>

          <Card>
            <Text style={[text.h2, styles.section]}>Performance (Today)</Text>
            <Text style={text.muted}>Visited vs. currently assigned / in progress</Text>
            <View style={styles.perfRow}>
              <Text style={styles.perfPct}>{d.performancePct === null ? '—' : `${d.performancePct}%`}</Text>
              <Text style={styles.perfFraction}>
                {d.visitedToday} / {d.assignedOpenNow}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, d.performancePct ?? 0)}%` }]} />
            </View>
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
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
  loading: { padding: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md, marginBottom: space.lg },
  statCard: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 11.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  section: { marginBottom: 2 },
  perfRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.md },
  perfPct: { fontSize: 32, fontWeight: '800', color: colors.primary },
  perfFraction: { fontSize: 15, fontWeight: '600', color: colors.muted },
  track: { height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', marginTop: space.sm },
  fill: { height: '100%', borderRadius: 999, backgroundColor: colors.primary },
});
