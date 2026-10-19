import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { brand, colors, space } from '../theme';

interface Stage {
  key: string;
  label: string;
  count: number;
  pctOfFirst: number | null;
  conversionPct: number | null;
}
interface Pipeline {
  stages: Stage[];
  overallConversionPct: number | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const COLORS = [brand.blue, '#38a3e8', '#f29a1f', '#1baf7a'];

/** Leads -> Quotation -> Proforma -> Format-4 for the financial year, with step-over-step conversion. */
export function MdPipelineScreen() {
  const q = useQuery({ queryKey: ['md', 'pipeline'], queryFn: () => api.get<Pipeline>('/dashboard/md/pipeline') });
  const stages = q.data?.stages ?? [];
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load the pipeline.')} /> : null}

      <View style={styles.statGrid}>
        {stages.map((s) => (
          <View key={s.key} style={styles.statCard}>
            <Text style={styles.statLabel}>{s.label}</Text>
            <Text style={styles.statValue}>{s.count}</Text>
          </View>
        ))}
      </View>

      {stages.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Sales Pipeline</Text>
          {stages.map((s, i) => {
            const width = 34 + (s.count / max) * 66;
            return (
              <View key={s.key} style={styles.funnelRow}>
                <View style={[styles.funnelBand, { width: `${width}%`, backgroundColor: COLORS[i % COLORS.length] }]}>
                  <Text style={styles.funnelCount}>{s.count}</Text>
                </View>
                <Text style={styles.funnelLabel}>{s.label}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}

      {stages.length > 1 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Conversion Rate</Text>
          {stages.slice(1).map((s, i) => (
            <View key={s.key} style={styles.convRow}>
              <Text style={styles.convLabel}>
                {stages[i]!.label} → {s.label}
              </Text>
              <Text style={styles.convValue}>{s.conversionPct === null ? '—' : `${s.conversionPct}%`}</Text>
            </View>
          ))}
          <View style={styles.overall}>
            <Text style={styles.overallLabel}>Overall Conversion</Text>
            <Text style={styles.overallValue}>{q.data?.overallConversionPct === null || q.data?.overallConversionPct === undefined ? '—' : `${q.data.overallConversionPct}%`}</Text>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  cardTitle: { marginBottom: space.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  statCard: { flexGrow: 1, flexBasis: '22%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  funnelRow: { marginBottom: space.sm },
  funnelBand: { minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  funnelCount: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  funnelLabel: { textAlign: 'center', fontSize: 11.5, color: colors.muted, marginTop: 2 },
  convRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs },
  convLabel: { fontSize: 13, color: colors.text },
  convValue: { fontSize: 13, fontWeight: '700', color: colors.text },
  overall: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overallLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  overallValue: { fontSize: 22, fontWeight: '800', color: brand.blue },
});
