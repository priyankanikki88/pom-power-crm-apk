import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bars } from '../components/charts';
import { Segmented } from '../components/inputs';
import { Card, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatINRCompact } from '../lib/format';
import { colors, space } from '../theme';

type By = 'branch' | 'zone' | 'employee';
const OPTIONS: Array<{ value: By; label: string }> = [
  { value: 'branch', label: 'Branch' },
  { value: 'zone', label: 'Zone' },
  { value: 'employee', label: 'Employee' },
];

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
interface EmployeeRow {
  employee: string;
  target: number;
  achieved: number;
  achievedPct: number | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** How much of this financial year's target has actually been achieved — by branch, zone or employee. */
export function MdTargetAchievementScreen() {
  const [by, setBy] = useState<By>('branch');
  const q = useQuery({ queryKey: ['md', 'target-achievement', by], queryFn: () => api.get(`/dashboard/md/target-achievement`, { by }) });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Segmented value={by} options={OPTIONS} onChange={setBy} />
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load target achievement.')} /> : null}

      {by === 'zone' ? (
        <ZoneView rows={(q.data as ZoneRow[] | undefined) ?? []} />
      ) : by === 'employee' ? (
        <EmployeeView rows={(q.data as EmployeeRow[] | undefined) ?? []} />
      ) : (
        <BranchView rows={(q.data as BranchRow[] | undefined) ?? []} />
      )}
    </ScrollView>
  );
}

function BranchView({ rows }: { rows: BranchRow[] }) {
  if (rows.length === 0) return <Empty title="No branch targets set for this financial year" />;
  return (
    <>
      <Card>
        <Text style={[text.h2, styles.cardTitle]}>Target vs. Achievement (Branch)</Text>
        <Bars rows={rows.filter((r) => r.target).map((r) => ({ key: r.branch, label: r.branch, value: r.achievedPct ?? 0 }))} />
      </Card>
      <Card>
        {rows.map((r) => (
          <Row key={r.branch} label={r.branch} target={r.target !== null ? formatINRCompact(r.target) : '—'} achieved={formatINRCompact(r.sales)} pct={r.achievedPct} />
        ))}
      </Card>
    </>
  );
}

function EmployeeView({ rows }: { rows: EmployeeRow[] }) {
  if (rows.length === 0) return <Empty title="No employee targets set for this financial year" />;
  return (
    <Card>
      {rows.map((r) => (
        <Row key={r.employee} label={r.employee} target={formatINRCompact(r.target)} achieved={formatINRCompact(r.achieved)} pct={r.achievedPct} />
      ))}
    </Card>
  );
}

function ZoneView({ rows }: { rows: ZoneRow[] }) {
  if (rows.length === 0) return <Empty title="No zones set up yet" />;
  return (
    <>
      <Text style={text.muted}>No per-zone target — targets are set by branch or employee, not by zone. Shown is each zone's share of total sales.</Text>
      <Card>
        {rows.map((r) => (
          <Row key={r.zone} label={r.zone} target="—" achieved={formatINRCompact(r.sales)} pct={r.sharePct} />
        ))}
      </Card>
    </>
  );
}

function Row({ label, target, achieved, pct }: { label: string; target: string; achieved: string; pct: number | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowDetail}>
          {achieved} / {target}
        </Text>
        <Text style={[styles.pct, pct !== null && pct >= 100 ? styles.pctGood : null]}>{pct !== null ? `${pct}%` : '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  cardTitle: { marginBottom: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: space.sm },
  rowLabel: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
  rowRight: { alignItems: 'flex-end' },
  rowDetail: { fontSize: 11.5, color: colors.muted },
  pct: { fontSize: 14, fontWeight: '800', color: colors.warning },
  pctGood: { color: colors.success },
});
