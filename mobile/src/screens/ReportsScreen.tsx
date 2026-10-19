import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { formatINR } from '../lib/format';
import type { SalesStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

export interface ReportCatalogueItem {
  id: string;
  group: string;
  title: string;
  description: string;
  params: string[];
}
export type ReportColumnType = 'text' | 'date' | 'money' | 'number' | 'percent';
export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  width?: number;
}
type Cell = string | number | null;
export interface ReportResult {
  id: string;
  title: string;
  period?: { fromDate: string; toDate: string };
  columns: ReportColumn[];
  rows: Array<Record<string, Cell>>;
  totals: Record<string, Cell> | null;
  summary?: Array<{ label: string; value: Cell; type: string }>;
  truncated?: boolean;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const GROUP_LABEL: Record<string, string> = {
  SALES: 'Sales',
  SERVICE: 'Service',
  STOCK: 'Stock',
  DISPATCH: 'Stock & Dispatch',
  PAYMENT: 'Payment',
  CUSTOMER: 'Customer',
  TARGET: 'Targets',
  ATTENDANCE: 'Attendance',
  EXPENSE: 'Expenses',
  TOUR: 'Tour Plans',
  LEAD: 'Leads',
  MARKETING: 'Marketing',
};

/** Every report the signed-in user has permission for (server-filtered) — same catalogue the web CRM's Reports page lists. */
export function ReportsScreen({ navigation }: NativeStackScreenProps<SalesStackParams, 'Reports'>) {
  const q = useQuery({ queryKey: ['reports', 'catalogue'], queryFn: () => api.get<ReportCatalogueItem[]>('/reports') });
  const groups = new Map<string, ReportCatalogueItem[]>();
  for (const r of q.data ?? []) {
    const list = groups.get(r.group) ?? [];
    list.push(r);
    groups.set(r.group, list);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load reports.')} /> : null}
      {q.data && q.data.length === 0 ? <Empty title="No reports available for your role" /> : null}
      {[...groups.entries()].map(([group, items]) => (
        <View key={group} style={styles.section}>
          <Text style={styles.sectionTitle}>{GROUP_LABEL[group] ?? group}</Text>
          {items.map((r) => (
            <Pressable key={r.id} style={styles.row} onPress={() => navigation.navigate('ReportViewer', { id: r.id, title: r.title })} accessibilityRole="button">
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={text.muted} numberOfLines={2}>
                  {r.description}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const COL_WIDTH: Record<ReportColumnType, number> = { text: 150, date: 100, money: 120, number: 90, percent: 80 };
function fmtCell(v: Cell, type: ReportColumnType): string {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'money') return formatINR(v);
  if (type === 'percent') return `${v}%`;
  if (type === 'date') return formatDate(String(v));
  return String(v);
}

/** Renders any report id generically (any column shape) — the same /reports/:id the web CRM's report pages call, default period (this month) applied server-side. */
export function ReportViewerScreen({ route }: NativeStackScreenProps<SalesStackParams, 'ReportViewer'>) {
  const { id } = route.params;
  const q = useQuery({ queryKey: ['reports', 'view', id], queryFn: () => api.get<ReportResult>(`/reports/${id}`) });
  const r = q.data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this report.')} /> : null}
      {r ? (
        <>
          {r.period ? (
            <Text style={[text.muted, styles.period]}>
              {formatDate(r.period.fromDate)} – {formatDate(r.period.toDate)}
            </Text>
          ) : null}
          {r.summary && r.summary.length > 0 ? (
            <View style={styles.summaryRow}>
              {r.summary.map((s, i) => (
                <View key={i} style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>{s.label}</Text>
                  <Text style={styles.summaryValue}>{fmtCell(s.value, (s.type as ReportColumnType) ?? 'text')}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {r.truncated ? <Text style={[text.muted, styles.note]}>Showing the first rows only — export from the web CRM for the full report.</Text> : null}
          {r.rows.length === 0 ? (
            <Empty title="Nothing to show" hint="No rows for the current period." />
          ) : (
            <ScrollView horizontal>
              <View>
                <View style={styles.tableRow}>
                  {r.columns.map((c) => (
                    <Text key={c.key} style={[styles.th, { width: c.width ? c.width * 60 : COL_WIDTH[c.type] }]} numberOfLines={2}>
                      {c.label}
                    </Text>
                  ))}
                </View>
                {r.rows.map((row, i) => (
                  <View key={i} style={[styles.tableRow, i % 2 === 1 && styles.rowAlt]}>
                    {r.columns.map((c) => (
                      <Text key={c.key} style={[styles.td, { width: c.width ? c.width * 60 : COL_WIDTH[c.type] }]} numberOfLines={2}>
                        {fmtCell(row[c.key] ?? null, c.type)}
                      </Text>
                    ))}
                  </View>
                ))}
                {r.totals ? (
                  <View style={[styles.tableRow, styles.totalsRow]}>
                    {r.columns.map((c) => (
                      <Text key={c.key} style={[styles.td, styles.totalsText, { width: c.width ? c.width * 60 : COL_WIDTH[c.type] }]} numberOfLines={2}>
                        {fmtCell(r.totals![c.key] ?? null, c.type)}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </ScrollView>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.xl },
  flex: { flex: 1 },
  section: { marginBottom: space.lg },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.muted, marginBottom: space.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  chevron: { fontSize: 20, color: colors.muted },
  period: { marginBottom: space.md },
  note: { marginBottom: space.md },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  summaryCard: { flexBasis: '31%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  summaryLabel: { fontSize: 11.5, color: colors.muted, fontWeight: '600' },
  summaryValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 },
  tableRow: { flexDirection: 'row' },
  rowAlt: { backgroundColor: colors.surface },
  th: { fontSize: 11.5, fontWeight: '800', color: colors.muted, padding: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  td: { fontSize: 12.5, color: colors.text, padding: space.sm },
  totalsRow: { borderTopWidth: 1, borderTopColor: colors.border },
  totalsText: { fontWeight: '800' },
});
