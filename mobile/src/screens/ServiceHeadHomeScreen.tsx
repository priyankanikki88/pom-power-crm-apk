import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Bars } from '../components/charts';
import { Card, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { brand, colors, radius, space } from '../theme';

interface ServiceHeadHome {
  totals: { total: number; open: number; inProgress: number };
  firstTimeFixRate: number | null;
  avgResolutionDays: number | null;
  monthlyTrend: Array<{ month: string; open: number; inProgress: number; resolved: number }>;
  byProductType: Array<{ category: string; count: number }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** The Service Head's own Home — ticket totals, first-time fix rate, resolution time and service load by product type. */
export function ServiceHeadHomeScreen() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['service-head', 'home'], queryFn: () => api.get<ServiceHeadHome>('/service/head/home') });
  const d = q.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <View style={styles.hero}>
        <Text style={styles.heroGreeting}>
          {greeting}, {user?.fullName?.split(' ')[0]}
        </Text>
        <Text style={styles.heroSub}>Service Head</Text>
      </View>

      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <Text style={styles.error}>{errorText(q.error, 'Could not load your numbers.')}</Text> : null}

      {d ? (
        <View style={styles.statGrid}>
          <Stat label="Total Tickets" value={String(d.totals.total)} />
          <Stat label="Open" value={String(d.totals.open)} tone={colors.danger} />
          <Stat label="In Progress" value={String(d.totals.inProgress)} tone={colors.warning} />
          <Stat label="First Time Fix" value={d.firstTimeFixRate === null ? '—' : `${d.firstTimeFixRate}%`} tone={colors.success} />
          <Stat label="Avg. Resolution" value={d.avgResolutionDays === null ? '—' : `${d.avgResolutionDays}d`} />
        </View>
      ) : null}

      {d && d.monthlyTrend.some((m) => m.open + m.inProgress + m.resolved > 0) ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Tickets Trend (Monthly)</Text>
          {d.monthlyTrend.map((m) => (
            <View key={m.month} style={styles.trendRow}>
              <Text style={styles.trendMonth}>{m.month}</Text>
              <Text style={styles.trendCell}>
                <Text style={{ color: colors.danger }}>{m.open}</Text> open ·{' '}
                <Text style={{ color: colors.warning }}>{m.inProgress}</Text> in-progress ·{' '}
                <Text style={{ color: colors.success }}>{m.resolved}</Text> resolved
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {d && d.byProductType.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Service by Product Type</Text>
          <Bars rows={d.byProductType.map((c) => ({ key: c.category, label: c.category, value: c.count }))} />
        </Card>
      ) : null}
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
  hero: { backgroundColor: brand.blue, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  heroGreeting: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  heroSub: { fontSize: 13.5, color: '#dde2fb', marginTop: 2 },
  loading: { padding: space.lg },
  error: { color: colors.danger, marginBottom: space.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  statCard: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2 },
  cardTitle: { marginBottom: space.sm },
  trendRow: { paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  trendMonth: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  trendCell: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
});
