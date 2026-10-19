import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '../components/inputs';
import { Bars } from '../components/charts';
import { Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatINRCompact } from '../lib/format';
import { colors, space } from '../theme';

type ViewTab = 'monthly' | 'quarterly' | 'branch' | 'zone';
const VIEWS: Array<{ value: ViewTab; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'branch', label: 'Branch' },
  { value: 'zone', label: 'Zone' },
];

interface Bucket {
  label?: string;
  month?: string;
  sales: number;
  target: number | null;
}
interface BranchRow {
  branch: string;
  sales: number;
  target: number | null;
  achievedPct: number | null;
}
interface ZoneRow {
  zone: string;
  sales: number;
  sharePct: number;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Sales Report: the same company-wide actual-revenue figure viewed four ways — Monthly / Quarterly / Branch / Zone. */
export function MdSalesReportScreen() {
  const [view, setView] = useState<ViewTab>('monthly');
  const q = useQuery({ queryKey: ['md', 'sales-report', view], queryFn: () => api.get(`/dashboard/md/sales-report`, { view }) });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Segmented value={view} options={VIEWS} onChange={setView} />
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load the report.')} /> : null}

      {view === 'monthly' || view === 'quarterly' ? (
        <MonthlyOrQuarterly rows={(q.data as Bucket[] | undefined) ?? []} />
      ) : view === 'branch' ? (
        <BranchTable rows={(q.data as BranchRow[] | undefined) ?? []} />
      ) : (
        <ZoneTable rows={(q.data as ZoneRow[] | undefined) ?? []} />
      )}
    </ScrollView>
  );
}

function MonthlyOrQuarterly({ rows }: { rows: Bucket[] }) {
  if (rows.length === 0) return null;
  const labels = rows.map((r) => r.label ?? r.month ?? '');
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalTarget = rows.reduce((s, r) => s + (r.target ?? 0), 0);
  const achPct = totalTarget > 0 ? Math.round((totalSales / totalTarget) * 1000) / 10 : null;
  return (
    <>
      <View style={styles.summaryRow}>
        <Summary label="Total Sales" value={formatINRCompact(totalSales)} />
        <Summary label="Target" value={totalTarget > 0 ? formatINRCompact(totalTarget) : '—'} />
        <Summary label="Achievement" value={achPct === null ? '—' : `${achPct}%`} />
      </View>
      <Card>
        <Text style={[text.h2, styles.cardTitle]}>Sales vs. Target</Text>
        {rows.every((r) => r.sales === 0) ? <Empty title="No sales recorded yet" /> : <Bars rows={rows.map((r, i) => ({ key: labels[i]!, label: labels[i]!, value: r.sales }))} money />}
      </Card>
      <Card>
        <Text style={[text.h2, styles.cardTitle]}>Details</Text>
        {rows.map((r, i) => (
          <View key={labels[i]} style={styles.tableRow}>
            <Text style={styles.tableCell}>{labels[i]}</Text>
            <Text style={[styles.tableCell, styles.num]}>{formatINRCompact(r.sales)}</Text>
            <Text style={[styles.tableCell, styles.num]}>{r.target !== null ? formatINRCompact(r.target) : '—'}</Text>
            <Text style={[styles.tableCell, styles.num]}>{r.target && r.target > 0 ? `${Math.round((r.sales / r.target) * 1000) / 10}%` : '—'}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function BranchTable({ rows }: { rows: BranchRow[] }) {
  if (rows.length === 0) return <Empty title="No branch-wise sales yet" />;
  return (
    <>
      <Card>
        <Text style={[text.h2, styles.cardTitle]}>Branch Wise Sales</Text>
        <Bars rows={rows.map((r) => ({ key: r.branch, label: r.branch, value: r.sales }))} money />
      </Card>
      <Card>
        {rows.map((r) => (
          <View key={r.branch} style={styles.tableRow}>
            <Text style={styles.tableCell}>{r.branch}</Text>
            <Text style={[styles.tableCell, styles.num]}>{formatINRCompact(r.sales)}</Text>
            <Text style={[styles.tableCell, styles.num]}>{r.target !== null ? formatINRCompact(r.target) : '—'}</Text>
            <Text style={[styles.tableCell, styles.num]}>{r.achievedPct !== null ? `${r.achievedPct}%` : '—'}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function ZoneTable({ rows }: { rows: ZoneRow[] }) {
  if (rows.length === 0) return <Empty title="No zones set up yet" hint="Add zones and assign states under Settings → Organizational Hierarchy on the web." />;
  return (
    <>
      <Card>
        <Text style={[text.h2, styles.cardTitle]}>Zone Wise Sales Distribution</Text>
        <Bars rows={rows.map((r) => ({ key: r.zone, label: r.zone, value: r.sales }))} money />
      </Card>
      <Card>
        <Text style={text.muted}>No per-zone target — targets are set by branch or employee, not by zone.</Text>
        {rows.map((r) => (
          <View key={r.zone} style={styles.tableRow}>
            <Text style={styles.tableCell}>{r.zone}</Text>
            <Text style={[styles.tableCell, styles.num]}>{formatINRCompact(r.sales)}</Text>
            <Text style={[styles.tableCell, styles.num]}>{r.sharePct}%</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  cardTitle: { marginBottom: space.sm },
  summaryRow: { flexDirection: 'row', gap: space.sm, marginVertical: space.md },
  summaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  summaryLabel: { fontSize: 10.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  summaryValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 },
  tableRow: { flexDirection: 'row', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: space.sm },
  tableCell: { flex: 1, fontSize: 12.5, color: colors.text },
  num: { textAlign: 'right' },
});
