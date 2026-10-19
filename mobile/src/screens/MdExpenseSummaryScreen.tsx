import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bars } from '../components/charts';
import { Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { enumLabel, formatINRCompact } from '../lib/format';
import { colors, space } from '../theme';

interface ExpenseSummary {
  total: number;
  approved: number;
  pending: number;
  byCategory: Array<{ category: string; value: number }>;
  monthlyTrend: Array<{ month: string; value: number }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** This financial year's expense claims, company-wide. */
export function MdExpenseSummaryScreen() {
  const q = useQuery({ queryKey: ['md', 'expense-summary'], queryFn: () => api.get<ExpenseSummary>('/dashboard/md/expense-summary') });
  const d = q.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load the expense summary.')} /> : null}

      {d ? (
        <View style={styles.statGrid}>
          <Stat label="Total" value={formatINRCompact(d.total)} />
          <Stat label="Approved" value={formatINRCompact(d.approved)} tone={colors.success} />
          <Stat label="Pending" value={formatINRCompact(d.pending)} tone={colors.warning} />
        </View>
      ) : null}

      {d && d.byCategory.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Expense by Category</Text>
          <Bars rows={d.byCategory.map((c) => ({ key: c.category, label: enumLabel(c.category), value: c.value }))} money />
        </Card>
      ) : null}

      {d && d.monthlyTrend.some((m) => m.value > 0) ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Monthly Expense Trend</Text>
          <Bars rows={d.monthlyTrend.filter((m) => m.value > 0).map((m) => ({ key: m.month, label: m.month, value: m.value }))} money color={colors.warning} />
        </Card>
      ) : null}

      {d && d.total === 0 ? <Empty title="No expenses recorded yet this financial year" /> : null}
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
  statGrid: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 10.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
});
