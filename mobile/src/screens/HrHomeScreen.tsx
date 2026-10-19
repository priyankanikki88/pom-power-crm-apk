import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Bars } from '../components/charts';
import { Card, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { brand, colors, radius, space } from '../theme';

interface HrHome {
  totalEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  newJoinersThisMonth: number;
  headcountTrend: Array<{ month: string; newJoiners: number }>;
  byDepartment: Array<{ department: string; count: number }>;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** The HR Head's own Home — headcount, today's attendance and the department mix. */
export function HrHomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const q = useQuery({ queryKey: ['hr', 'home'], queryFn: () => api.get<HrHome>('/users/hr/home') });
  const d = q.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <View style={styles.hero}>
        <Text style={styles.heroGreeting}>
          {greeting}, {user?.fullName?.split(' ')[0]}
        </Text>
        <Text style={styles.heroSub}>HR Head</Text>
      </View>

      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <Text style={styles.error}>{errorText(q.error, 'Could not load your numbers.')}</Text> : null}

      {d ? (
        <View style={styles.statGrid}>
          <Stat label="Total Employees" value={String(d.totalEmployees)} />
          <Stat label="Present Today" value={String(d.presentToday)} tone={colors.success} />
          <Stat label="On Leave" value={String(d.onLeaveToday)} tone={colors.warning} />
          <Stat label="New Joiners" value={String(d.newJoinersThisMonth)} hint="This Month" />
        </View>
      ) : null}

      {d && d.headcountTrend.some((m) => m.newJoiners > 0) ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>New Joiners (Monthly)</Text>
          <Bars rows={d.headcountTrend.filter((m) => m.newJoiners > 0).map((m) => ({ key: m.month, label: m.month, value: m.newJoiners }))} />
        </Card>
      ) : null}

      {d && d.byDepartment.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.cardTitle]}>Department Wise Headcount</Text>
          <Bars rows={d.byDepartment.map((r) => ({ key: r.department, label: r.department, value: r.count }))} />
        </Card>
      ) : null}

      {[
        { screen: 'HrApprovals', label: 'Approval Center' },
        { screen: 'JobOpenings', label: 'Recruitment' },
        { screen: 'TrainingSessions', label: 'Training & Development' },
        { screen: 'Appraisals', label: 'Performance & Appraisal' },
      ].map((it) => (
        <Pressable key={it.screen} style={styles.approvalsLink} onPress={() => navigation.navigate(it.screen)} accessibilityRole="button">
          <Text style={styles.approvalsLinkText}>{it.label}</Text>
          <Text style={styles.approvalsLinkArrow}>{'›'}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
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
  statCard: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  statHint: { fontSize: 11, color: colors.muted, marginTop: 2 },
  cardTitle: { marginBottom: space.sm },
  approvalsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  approvalsLinkText: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  approvalsLinkArrow: { fontSize: 20, color: colors.muted },
});
