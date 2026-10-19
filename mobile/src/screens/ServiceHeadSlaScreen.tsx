import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, space } from '../theme';

interface Sla {
  total: number;
  withinPct: number | null;
  breachedPct: number | null;
  pendingPct: number | null;
  breaches: Array<{ ticketNo: string; customer: string; daysOverdue: number }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** SLA due date is computed from each ticket's priority (CRITICAL 1 day ... LOW 5 days) — this app has no configured SLA target, so a starting policy is used rather than inventing a storage mechanism nobody has asked for yet. */
export function ServiceHeadSlaScreen() {
  const q = useQuery({ queryKey: ['service-head', 'sla'], queryFn: () => api.get<Sla>('/service/head/sla') });
  const d = q.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load SLA performance.')} /> : null}

      {d && d.total > 0 ? (
        <>
          <View style={styles.statGrid}>
            <Stat label="Within SLA" value={d.withinPct === null ? '—' : `${d.withinPct}%`} tone={colors.success} />
            <Stat label="Breached" value={d.breachedPct === null ? '—' : `${d.breachedPct}%`} tone={colors.danger} />
            <Stat label="Pending" value={d.pendingPct === null ? '—' : `${d.pendingPct}%`} tone={colors.warning} />
          </View>
          <Text style={text.muted}>{d.total} tickets</Text>

          {d.breaches.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.cardTitle]}>SLA Breach Details</Text>
              {d.breaches.map((b) => (
                <View key={b.ticketNo} style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.ticketNo}>{b.ticketNo}</Text>
                    <Text style={text.muted}>{b.customer}</Text>
                  </View>
                  <Text style={styles.overdue}>{b.daysOverdue}d overdue</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
      {d && d.total === 0 ? <Empty title="No tickets to measure yet" /> : null}
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
  statGrid: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: space.sm },
  flex: { flex: 1 },
  ticketNo: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  overdue: { fontSize: 13, fontWeight: '800', color: colors.danger },
});
