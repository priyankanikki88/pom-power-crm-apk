import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Empty, ErrorBox } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatINRCompact } from '../lib/format';
import { brand, colors, radius, space } from '../theme';

interface Row {
  user: { id: string; fullName: string };
  sales: number;
  format4Count: number;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Top performers for the financial year, ranked by actual revenue (the same figure Sales Report and Target Achievement use). */
export function MdTopEmployeesScreen() {
  const q = useQuery({ queryKey: ['md', 'top-employees'], queryFn: () => api.get<Row[]>('/dashboard/md/top-employees') });
  const rows = (q.data ?? []).slice(0, 10);
  const max = Math.max(1, ...rows.map((r) => r.sales));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load the ranking.')} /> : null}
      {q.data && rows.length === 0 ? <Empty title="No sales recorded yet this financial year" /> : null}
      {rows.map((r, i) => (
        <Card key={r.user.id}>
          <View style={styles.row}>
            <View style={[styles.rank, i < 3 ? styles.rankTop : null]}>
              <Text style={[styles.rankText, i < 3 ? styles.rankTextTop : null]}>{i + 1}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{r.user.fullName}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(r.sales / max) * 100}%` }]} />
              </View>
              <Text style={styles.deals}>{r.format4Count} Format-4{r.format4Count === 1 ? '' : 's'}</Text>
            </View>
            <Text style={styles.value}>{formatINRCompact(r.sales)}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rankTop: { backgroundColor: brand.blue },
  rankText: { fontSize: 13, fontWeight: '800', color: colors.muted },
  rankTextTop: { color: '#ffffff' },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text, marginBottom: 4 },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden', marginBottom: 4 },
  fill: { height: '100%', borderRadius: 999, backgroundColor: brand.blue },
  deals: { fontSize: 11.5, color: colors.muted },
  value: { fontSize: 14, fontWeight: '800', color: colors.text },
});
