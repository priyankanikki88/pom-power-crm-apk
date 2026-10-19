import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bars } from '../components/charts';
import { Badge, Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import { colors, space } from '../theme';

interface ServiceSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  recent: Array<{ ticketNo: string; customer: string; status: string; createdAt: string }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** This month's service tickets, company-wide. No ticket "category" field exists in this app — Tickets by Priority stands in for it, a real grouping rather than an invented one. */
export function MdServiceSummaryScreen() {
  const q = useQuery({ queryKey: ['md', 'service-summary'], queryFn: () => api.get<ServiceSummary>('/dashboard/md/service-summary') });
  const d = q.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load the service summary.')} /> : null}

      {d ? (
        <View style={styles.statGrid}>
          <Stat label="Total Tickets" value={String(d.total)} />
          <Stat label="Open" value={String(d.open)} tone={colors.danger} />
          <Stat label="In Progress" value={String(d.inProgress)} tone={colors.warning} />
          <Stat label="Resolved" value={String(d.resolved)} tone={colors.success} />
        </View>
      ) : null}

      {d && d.byPriority.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Tickets by Priority</Text>
          <Bars rows={d.byPriority.map((p) => ({ key: p.priority, label: enumLabel(p.priority), value: p.count }))} />
        </Card>
      ) : null}

      {d && d.recent.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Recent Service Tickets</Text>
          {d.recent.map((r) => (
            <View key={r.ticketNo} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.name}>{r.ticketNo}</Text>
                <Text style={text.muted}>
                  {r.customer} · {formatDate(r.createdAt)}
                </Text>
              </View>
              <Badge value={r.status} label={enumLabel(r.status)} />
            </View>
          ))}
        </Card>
      ) : null}

      {d && d.total === 0 ? <Empty title="No service tickets logged this month" /> : null}
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
