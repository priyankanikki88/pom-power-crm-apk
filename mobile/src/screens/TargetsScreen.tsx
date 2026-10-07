import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { formatINRCompact } from '../lib/format';
import { colors, space } from '../theme';
import type { TargetRow } from '../types';

const METRIC: Record<TargetRow['metric'], string> = { SALES_REVENUE: 'Sales Revenue', PRODUCT_REVENUE: 'Product Revenue', AMC_REVENUE: 'AMC Revenue', SERVICE_TICKETS_CLOSED: 'Service Tickets Closed' };
const PERIOD: Record<TargetRow['period'], string> = { YEARLY: 'Yearly', QUARTERLY: 'Quarterly', MONTHLY: 'Monthly', WEEKLY: 'Weekly', CUSTOM: 'Custom' };

/** Current targets and their live achievement — the same figures the web CRM's Targets page computes (the app never calculates its own). */
export function TargetsScreen() {
  const q = useQuery({ queryKey: ['targets', 'current'], queryFn: () => api.get<TargetRow[]>('/targets', { current: 'true' }) });
  const rows = q.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={q.error instanceof ApiError ? q.error.message : 'Could not load targets.'} /> : null}
      {q.data && rows.length === 0 ? <Empty title="No current targets" hint="Targets are set on the web CRM." /> : null}
      {rows.map((t) => {
        const money = t.metric !== 'SERVICE_TICKETS_CLOSED';
        const fmt = (v: number) => (money ? formatINRCompact(v) : v.toLocaleString('en-IN'));
        const pct = t.achievedPct ?? 0;
        const tone = t.achievedPct === null ? colors.primary : pct >= 100 ? colors.success : pct < 60 ? colors.danger : colors.primary;
        const who = t.scopeType === 'USER' ? (t.user?.fullName ?? 'User') : t.scopeType === 'BRANCH' ? (t.branch?.name ?? 'Branch') : 'Company';
        return (
          <Card key={t.id}>
            <View style={styles.head}>
              <Text style={[text.h2, styles.flex]}>{METRIC[t.metric]}</Text>
              <Text style={[styles.pct, { color: tone }]}>{t.achievedPct === null ? '—' : `${t.achievedPct}%`}</Text>
            </View>
            <Text style={text.muted}>
              {who} · {PERIOD[t.period]} · {formatDate(t.periodStart)} – {formatDate(t.periodEnd)}
            </Text>
            <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(100, Math.max(0, pct))) }}>
              <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: tone }]} />
            </View>
            <View style={styles.figures}>
              <View>
                <Text style={text.muted}>Target</Text>
                <Text style={styles.figure}>{fmt(t.amount)}</Text>
              </View>
              <View>
                <Text style={text.muted}>Achieved</Text>
                <Text style={[styles.figure, { color: tone }]}>{fmt(t.achieved)}</Text>
              </View>
              <View>
                <Text style={text.muted}>Balance</Text>
                <Text style={styles.figure}>{fmt(Math.max(0, t.amount - t.achieved))}</Text>
              </View>
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pct: { fontSize: 20, fontWeight: '800' },
  track: { height: 10, borderRadius: 999, backgroundColor: '#eef1f6', overflow: 'hidden', marginVertical: space.md },
  fill: { height: '100%', borderRadius: 999 },
  figures: { flexDirection: 'row', justifyContent: 'space-between' },
  figure: { fontSize: 16, fontWeight: '700', color: colors.text },
});
