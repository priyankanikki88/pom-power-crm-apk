import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatINRCompact } from '../lib/format';
import { colors, radius, space } from '../theme';
import { ChipSelect } from './inputs';
import { text } from './ui';

type ColumnType = 'text' | 'date' | 'money' | 'number' | 'percent';
type Cell = string | number | null;
interface Column {
  key: string;
  label: string;
  type: ColumnType;
}
/** GET /reports/:id — the parts a dashboard widget reads. */
interface ReportResult {
  id: string;
  title: string;
  columns: Column[];
  rows: Array<Record<string, Cell>>;
  totals: Record<string, Cell> | null;
}
interface Widget {
  id: string;
  title: string;
  reportId: string;
  chart: 'pie' | 'bar' | 'line' | 'combo' | 'map' | 'number' | 'table';
  period: string;
  granularity?: string;
  groupBy?: string;
  value?: string;
}
interface RoleDashboardData {
  role: { id: string; name: string };
  layout: { rows: Array<{ widgets: Widget[] }> };
}
interface Point {
  label: string;
  value: number;
}

const PERIOD_LABEL: Record<string, string> = { today: 'Today', yesterday: 'Yesterday', week: 'This Week', lastWeek: 'Last Week', month: 'This Month', lastMonth: 'Last Month', quarter: 'This Quarter', halfYear: 'This Half-Year', year: 'This Year', lastYear: 'Last Year' };
const SERIES = ['#2f5fe0', '#1baf7a', '#7c5ce0', '#ef7d22', '#0f9fb5', '#d64545', '#9aa3b2'];
const MAX_POINTS = 24;
const isMeasure = (t: ColumnType) => t === 'money' || t === 'number';
const isCategory = (t: ColumnType) => t === 'text' || t === 'date';
const num = (v: Cell | undefined) => Number(v) || 0;
const fmt = (v: number, money: boolean) => (money ? formatINRCompact(v) : v.toLocaleString('en-IN', { maximumFractionDigits: 2 }));

/** The same defaults the web dashboard uses: group by the first readable column, value = actual revenue when the report has it. */
function pick(r: ReportResult, w: Widget): { category?: Column; value?: Column } {
  const categories = r.columns.filter((c) => isCategory(c.type) && !/note|remark/i.test(c.key));
  const all = r.columns.filter((c) => isMeasure(c.type));
  const measures = all.filter((c) => r.rows.some((row) => num(row[c.key]) !== 0));
  const distinct = (c: Column) => new Set(r.rows.map((row) => String(row[c.key] ?? ''))).size;
  const category = categories.find((c) => c.key === w.groupBy) ?? categories.find((c) => c.type === 'date' || distinct(c) <= MAX_POINTS) ?? categories[0];
  const value = all.find((c) => c.key === w.value) ?? measures.find((c) => c.key === 'gross') ?? measures.find((c) => c.type === 'money') ?? measures[0] ?? all[0];
  return { category, value };
}

/** Rows grouped by the category, the value summed. `ordered` = the rows already run in time order (a per-period report). */
function group(r: ReportResult, category: Column, value: Column): { points: Point[]; ordered: boolean } {
  const isDate = category.type === 'date';
  const map = new Map<string, Point>();
  for (const row of r.rows) {
    const raw = row[category.key];
    let key = raw === null || raw === undefined || raw === '' ? '—' : String(raw);
    if (isDate && key !== '—') key = key.slice(0, 10);
    let p = map.get(key);
    if (!p) map.set(key, (p = { label: key, value: 0 }));
    p.value += num(row[value.key]);
  }
  const points = [...map.values()];
  if (isDate) points.sort((a, b) => a.label.localeCompare(b.label));
  return { points, ordered: isDate || category.key === 'period' };
}

function Bars({ points, money, ordered }: { points: Point[]; money: boolean; ordered: boolean }) {
  // A time series keeps its order (the latest 12); anything else shows the biggest 8.
  const shown = ordered ? points.slice(-12) : [...points].sort((a, b) => b.value - a.value).slice(0, 8);
  const max = Math.max(...shown.map((p) => Math.abs(p.value)), 1);
  return (
    <View>
      {shown.map((p, i) => (
        <View key={`${i}-${p.label}`} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{p.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max((Math.abs(p.value) / max) * 100, p.value === 0 ? 0 : 2)}%` }]} />
          </View>
          <Text style={styles.barValue}>{fmt(p.value, money)}</Text>
        </View>
      ))}
      {!ordered && points.length > shown.length ? <Text style={styles.note}>Top {shown.length} of {points.length}</Text> : null}
    </View>
  );
}

function Shares({ points, money }: { points: Point[]; money: boolean }) {
  const sorted = [...points].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const top = sorted.length > 6 ? [...sorted.slice(0, 5), { label: 'Other', value: sorted.slice(5).reduce((s, p) => s + p.value, 0) }] : sorted;
  const total = top.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <Text style={text.muted}>Nothing to show.</Text>;
  return (
    <View>
      <View style={styles.shareBar}>
        {top.map((p, i) => (
          <View key={`${i}-${p.label}`} style={{ flex: p.value / total, backgroundColor: SERIES[i % SERIES.length] }} />
        ))}
      </View>
      {top.map((p, i) => (
        <View key={`${i}-${p.label}`} style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: SERIES[i % SERIES.length] }]} />
          <Text style={styles.legendLabel} numberOfLines={1}>{p.label}</Text>
          <Text style={styles.legendValue}>{fmt(p.value, money)}</Text>
          <Text style={styles.legendPct}>{((p.value / total) * 100).toFixed(1)}%</Text>
        </View>
      ))}
      <Text style={styles.note}>Total {fmt(total, money)}</Text>
    </View>
  );
}

function WidgetBody({ w, r }: { w: Widget; r: ReportResult }) {
  const { category, value } = pick(r, w);
  if (!value) return <Text style={text.muted}>This report has no figure to show.</Text>;
  const money = value.type === 'money';
  if (w.chart === 'number') {
    const total = r.totals && r.totals[value.key] !== undefined && r.totals[value.key] !== null ? num(r.totals[value.key]) : r.rows.reduce((s, row) => s + num(row[value.key]), 0);
    return (
      <View>
        <Text style={styles.number}>{fmt(total, money)}</Text>
        <Text style={text.muted}>{value.label}</Text>
      </View>
    );
  }
  if (!category) return <Text style={text.muted}>This report has nothing to group by.</Text>;
  const { points, ordered } = group(r, category, value);
  if (points.length === 0 || points.every((p) => p.value === 0)) return <Text style={text.muted}>Nothing to show for {(PERIOD_LABEL[w.period] ?? w.period).toLowerCase()}.</Text>;
  return (
    <View>
      <Text style={styles.axis}>{value.label} by {category.label}</Text>
      {w.chart === 'pie' ? <Shares points={points} money={money} /> : <Bars points={points} money={money} ordered={ordered && w.chart !== 'table' && w.chart !== 'map'} />}
    </View>
  );
}

function WidgetCard({ w }: { w: Widget }) {
  const report = useQuery({
    queryKey: ['designed-widget', w.reportId, w.period, w.granularity ?? ''],
    queryFn: () => api.get<ReportResult>(`/reports/${w.reportId}`, { period: w.period, tz: 'Asia/Kolkata', ...(w.granularity ? { granularity: w.granularity } : {}) }),
    retry: false,
    staleTime: 60_000,
  });
  const denied = report.error instanceof ApiError && report.error.status === 403;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={2}>{w.title || report.data?.title || 'Widget'}</Text>
        <Text style={styles.period}>{PERIOD_LABEL[w.period] ?? w.period}</Text>
      </View>
      {report.isLoading ? <Text style={text.muted}>Loading…</Text> : null}
      {report.isError ? <Text style={text.muted}>{denied ? 'Your role does not include this report.' : 'Could not load this widget.'}</Text> : null}
      {report.data && !report.isError ? <WidgetBody w={w} r={report.data} /> : null}
    </View>
  );
}

/**
 * The dashboard designed for the user's role (MD / CEO, Service Head, Sales & Marketing Head ...), as on the web Home.
 * A user who may switch dashboards (dashboard.switch) also chooses another role's dashboard; only the layout changes —
 * every widget still loads with the viewer's own access. Shows nothing when no dashboard was designed for the role.
 */
export function RoleDashboard() {
  const { hasPermission } = useAuth();
  const canSwitch = hasPermission('dashboard.switch');
  const mine = useQuery({ queryKey: ['dashboard-layouts', 'mine'], queryFn: () => api.get<RoleDashboardData[]>('/dashboard-layouts/mine'), staleTime: 60_000, retry: false });
  const others = useQuery({ queryKey: ['dashboard-layouts', 'others'], queryFn: () => api.get<RoleDashboardData[]>('/dashboard-layouts/others'), staleTime: 60_000, retry: false, enabled: canSwitch });
  const [picked, setPicked] = useState<string | null>(null);

  const own = mine.data ?? [];
  const all = [...own, ...(canSwitch ? (others.data ?? []) : [])];
  if (all.length === 0) return null;
  const options = all.map((d) => ({ value: d.role.id, label: d.role.name }));
  const chosen = all.find((d) => d.role.id === picked);
  // Default: the user's own role's dashboard(s); with none of their own, the first one they may switch to.
  const shown = chosen ? [chosen] : own.length > 0 ? own : all.slice(0, 1);

  return (
    <View style={styles.wrap}>
      {options.length > 1 ? <ChipSelect label="Select Dashboard" value={chosen ? chosen.role.id : null} options={options} onChange={setPicked} allowClear /> : null}
      {shown.map((d) => (
        <View key={d.role.id}>
          <Text style={[text.h2, styles.heading]}>{d.role.name} Dashboard</Text>
          {d.layout.rows.flatMap((row) => row.widgets).map((w) => (
            <WidgetCard key={`${d.role.id}-${w.id}`} w={w} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  heading: { marginBottom: space.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm, marginBottom: space.sm },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  period: { fontSize: 11.5, fontWeight: '600', color: colors.muted },
  axis: { fontSize: 11.5, color: colors.muted, marginBottom: space.sm },
  number: { fontSize: 28, fontWeight: '700', color: colors.text },
  note: { fontSize: 11.5, color: colors.muted, marginTop: space.xs },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 6 },
  barLabel: { width: '30%', fontSize: 12, color: colors.text },
  barTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: colors.bg, overflow: 'hidden' },
  barFill: { height: 12, borderRadius: 6, backgroundColor: colors.primary },
  barValue: { minWidth: 62, textAlign: 'right', fontSize: 12, fontWeight: '600', color: colors.text },
  shareBar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: space.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 12.5, color: colors.text },
  legendValue: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  legendPct: { minWidth: 46, textAlign: 'right', fontSize: 12, color: colors.muted },
});
