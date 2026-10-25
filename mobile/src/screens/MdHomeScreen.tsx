import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Bars } from '../components/charts';
import { Card, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatINRCompact } from '../lib/format';
import { brand, colors, radius, space } from '../theme';
import { usePendingCallLogCount } from './CallLogScreens';

interface MdHome {
  period: { fromDate: string; toDate: string };
  totals: {
    sales: { value: number; deltaPct: number | null };
    orders: { count: number; deltaPct: number | null };
    format4: { count: number; value: number };
    customers: { count: number; deltaPct: number | null };
  } | null;
  salesOverview: Array<{ month: string; sales: number; target: number | null }>;
  quickInsights: { topBranch: { name: string; value: number } | null; topZone: { name: string; value: number } | null; topEmployee: { name: string; value: number } | null } | null;
  pendingApprovals: number | null;
  pendingTasks: number | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const delta = (pct: number | null) => (pct === null ? null : `${pct >= 0 ? '+' : ''}${pct}%`);

/** The MD / CEO's own Home — the company's own numbers for the current financial year, not any one person's. */
export function MdHomeScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['md', 'home'], queryFn: () => api.get<MdHome>('/dashboard/md/home') });
  const d = q.data;
  const pendingCallLogs = usePendingCallLogCount();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <View style={styles.hero}>
        <Text style={styles.heroGreeting}>
          {greeting}, {user?.fullName?.split(' ')[0]}
        </Text>
        <Text style={styles.heroSub}>{d ? `FY ${d.period.fromDate.slice(0, 4)}-${d.period.toDate.slice(2, 4)}` : 'MD / CEO'}</Text>
      </View>

      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <Text style={styles.error}>{errorText(q.error, 'Could not load your numbers.')}</Text> : null}

      {d?.totals ? (
        <View style={styles.statGrid}>
          <Stat label="Total Sales" value={formatINRCompact(d.totals.sales.value)} hint={delta(d.totals.sales.deltaPct)} />
          <Stat label="Total Orders" value={String(d.totals.orders.count)} hint={delta(d.totals.orders.deltaPct)} />
          <Stat label="Total Format-4" value={String(d.totals.format4.count)} hint={formatINRCompact(d.totals.format4.value)} />
          <Stat label="Total Customers" value={String(d.totals.customers.count)} hint={delta(d.totals.customers.deltaPct)} />
        </View>
      ) : null}

      {d?.salesOverview && d.salesOverview.some((m) => m.sales > 0) ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Sales Overview</Text>
          <Bars rows={d.salesOverview.filter((m) => m.sales > 0).map((m) => ({ key: m.month, label: m.month, value: m.sales }))} money />
        </Card>
      ) : null}

      {d?.quickInsights && (d.quickInsights.topBranch || d.quickInsights.topZone || d.quickInsights.topEmployee) ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Quick Insights</Text>
          {d.quickInsights.topBranch ? <Insight label="Top Branch" name={d.quickInsights.topBranch.name} value={formatINRCompact(d.quickInsights.topBranch.value)} /> : null}
          {d.quickInsights.topZone ? <Insight label="Top Zone" name={d.quickInsights.topZone.name} value={formatINRCompact(d.quickInsights.topZone.value)} /> : null}
          {d.quickInsights.topEmployee ? <Insight label="Top Employee" name={d.quickInsights.topEmployee.name} value={formatINRCompact(d.quickInsights.topEmployee.value)} /> : null}
        </Card>
      ) : null}

      <View style={styles.statGrid}>
        {d?.pendingApprovals !== null && d?.pendingApprovals !== undefined ? (
          <Stat label="Pending Approvals" value={String(d.pendingApprovals)} tone={d.pendingApprovals > 0 ? colors.warning : undefined} onPress={() => navigation.navigate('Approval')} />
        ) : null}
        {d?.pendingTasks !== null && d?.pendingTasks !== undefined ? <Stat label="Pending Tasks" value={String(d.pendingTasks)} tone={d.pendingTasks > 0 ? colors.warning : undefined} /> : null}
        {pendingCallLogs.data !== undefined ? (
          <Stat label="Pending Call Logs" value={String(pendingCallLogs.data)} tone={pendingCallLogs.data > 0 ? colors.warning : undefined} onPress={() => navigation.navigate('More', { screen: 'CallLogs' })} />
        ) : null}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value, hint, tone, onPress }: { label: string; value: string; hint?: string | null; tone?: string; onPress?: () => void }) {
  return (
    <View style={styles.statCard} onTouchEnd={onPress}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function Insight({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <View style={styles.insightRow}>
      <Text style={styles.insightLabel}>{label}</Text>
      <Text style={styles.insightName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.insightValue}>{value}</Text>
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
  statCard: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  statHint: { fontSize: 12, color: colors.success, marginTop: 2, fontWeight: '600' },
  cardTitle: { marginBottom: space.sm },
  insightRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: space.sm },
  insightLabel: { width: 90, fontSize: 12, color: colors.muted, fontWeight: '600' },
  insightName: { flex: 1, fontSize: 13.5, color: colors.text },
  insightValue: { fontSize: 13.5, fontWeight: '700', color: colors.text },
});
