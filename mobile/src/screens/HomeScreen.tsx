import { useQuery } from '@tanstack/react-query';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { RoleDashboard } from '../components/RoleDashboard';
import { Card, Empty, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatINRCompact } from '../lib/format';
import { colors, radius, space } from '../theme';
import { OutboxBanner } from './OutboxScreen';

/** The parts of GET /dashboard/summary this screen reads. Each figure is null when the user's role may not see it. */
interface Summary {
  period: { fromDate: string; toDate: string };
  kpis: {
    quotations: { count: number; value: number } | null;
    format4s: { count: number; value: number } | null;
    invoices: { count: number; value: number } | null;
    received: { count: number; amount: number } | null;
    outstanding: { amount: number; overdue: number } | null;
  };
}
/** GET /service/summary — counts of what the user may see (an engineer: their own jobs). */
interface ServiceSummary {
  tickets: Partial<Record<string, number>>;
  installations: Partial<Record<string, number>>;
  unassigned: number;
  coordinator: boolean;
}
interface FollowUps {
  overdue: number;
  today: { total: number; done: number; pending: number };
  tomorrow: number;
}

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'danger' | 'success' }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, tone === 'danger' && { color: colors.danger }, tone === 'success' && { color: colors.success }]}>{value}</Text>
      {detail ? <Text style={styles.kpiDetail}>{detail}</Text> : null}
    </View>
  );
}

export function HomeScreen() {
  const { user, hasPermission } = useAuth();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const attendance = useQuery({ queryKey: ['attendance', 'today'], queryFn: () => api.get<{ canMark: boolean; status: string }>('/attendance/today') });
  const summary = useQuery({ queryKey: ['dashboard-summary', 'financialYear'], queryFn: () => api.get<Summary>('/dashboard/summary', { period: 'financialYear', trend: 'daily', productBasis: 'QUOTATION', tz: timeZone() }) });
  const followUps = useQuery({ queryKey: ['follow-ups', 'dashboard'], queryFn: () => api.get<FollowUps>('/follow-ups/dashboard'), enabled: hasPermission('followup.read') });
  const service = useQuery({ queryKey: ['service', 'summary'], queryFn: () => api.get<ServiceSummary>('/service/summary'), enabled: hasPermission('service.read') });
  const k = summary.data?.kpis;
  const refreshing = summary.isRefetching || followUps.isRefetching || service.isRefetching;
  const st = service.data?.tickets;
  const openTickets = st ? (st.OPEN ?? 0) + (st.ASSIGNED ?? 0) + (st.IN_PROGRESS ?? 0) : 0;
  const cards = k ? [k.invoices, k.format4s, k.received, k.outstanding, k.quotations].filter(Boolean).length : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void summary.refetch();
            void followUps.refetch();
            void service.refetch();
            void attendance.refetch();
          }}
        />
      }
    >
      <Text style={text.h1}>
        {greeting()}, {user?.fullName.split(' ')[0]}
      </Text>
      <Text style={[text.muted, styles.sub]}>
        {user?.userRoles?.[0]?.role.name ?? ''}
        {user?.branch?.name ? ` · ${user.branch.name}` : ''} · This month
      </Text>

      <OutboxBanner />
      {summary.isError && summary.error instanceof ApiError && summary.error.status === 0 ? <Text style={[text.muted, styles.sub]}>No network — showing what was last loaded on this phone.</Text> : null}

      {attendance.data?.canMark ? (
        <Pressable style={[styles.chip, styles.attendance]} onPress={() => navigation.navigate('More', { screen: 'Attendance', initial: false })} accessibilityRole="button">
          <Text style={[styles.chipCount, { color: colors.primaryDark }]}>!</Text>
          <Text style={styles.chipText}>Attendance not marked today — tap to mark</Text>
        </Pressable>
      ) : null}

      {followUps.data && (followUps.data.overdue > 0 || followUps.data.today.pending > 0) ? (
        <View style={styles.chips}>
          {followUps.data.overdue > 0 ? (
            <View style={[styles.chip, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.chipCount, { color: colors.danger }]}>{followUps.data.overdue}</Text>
              <Text style={styles.chipText}>Overdue follow-ups</Text>
            </View>
          ) : null}
          {followUps.data.today.pending > 0 ? (
            <View style={[styles.chip, { backgroundColor: colors.warningSoft }]}>
              <Text style={[styles.chipCount, { color: colors.warning }]}>{followUps.data.today.pending}</Text>
              <Text style={styles.chipText}>Follow-ups due today</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {summary.isLoading ? <Card><Text style={text.muted}>Loading your figures…</Text></Card> : null}
      {summary.isError ? <Card><Text style={{ color: colors.danger }}>{summary.error instanceof ApiError ? summary.error.message : 'Could not load the dashboard.'}</Text></Card> : null}

      {k && cards > 0 ? (
        <View style={styles.grid}>
          {k.invoices ? <Kpi label="Revenue (Invoiced)" value={formatINRCompact(k.invoices.value)} detail={`${k.invoices.count} invoice${k.invoices.count === 1 ? '' : 's'}`} /> : null}
          {k.format4s ? <Kpi label="Format-4 (Orders)" value={String(k.format4s.count)} detail={formatINRCompact(k.format4s.value)} /> : null}
          {k.received ? <Kpi label="Collections" value={formatINRCompact(k.received.amount)} detail={`${k.received.count} payment${k.received.count === 1 ? '' : 's'}`} tone={k.received.amount > 0 ? 'success' : undefined} /> : null}
          {k.outstanding ? <Kpi label="Outstanding" value={formatINRCompact(k.outstanding.amount)} detail={k.outstanding.overdue > 0 ? `${formatINRCompact(k.outstanding.overdue)} overdue` : 'Nothing overdue'} tone={k.outstanding.overdue > 0 ? 'danger' : undefined} /> : null}
          {k.quotations ? <Kpi label="Quotations" value={String(k.quotations.count)} detail={formatINRCompact(k.quotations.value)} /> : null}
        </View>
      ) : null}
      {service.data ? (
        <>
          <Text style={[text.h2, styles.heading]}>Service</Text>
          <View style={styles.grid}>
            <Kpi label="Open tickets" value={String(openTickets)} detail={service.data.coordinator && service.data.unassigned > 0 ? `${service.data.unassigned} not assigned` : undefined} tone={openTickets > 0 ? undefined : 'success'} />
            <Kpi label="On hold" value={String(st?.PENDING ?? 0)} />
            <Kpi label="Installations scheduled" value={String(service.data.installations.SCHEDULED ?? 0)} />
            <Kpi label="Installations in progress" value={String(service.data.installations.IN_PROGRESS ?? 0)} />
          </View>
        </>
      ) : null}
      <RoleDashboard />
      {k && cards === 0 && !service.data ? <Empty title="No figures for your role" hint="Your role does not include the documents these cards are built from." /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  sub: { marginTop: 2, marginBottom: space.lg },
  heading: { marginTop: space.lg, marginBottom: space.md },
  chips: { gap: space.sm, marginBottom: space.lg },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.md },
  attendance: { backgroundColor: colors.primarySoft, marginBottom: space.lg },
  chipCount: { fontSize: 20, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  kpiLabel: { fontSize: 12.5, fontWeight: '600', color: colors.muted },
  kpiValue: { fontSize: 24, fontWeight: '700', color: colors.text, marginTop: 4 },
  kpiDetail: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
});
