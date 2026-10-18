import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button, Card, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { brand, colors, radius, space } from '../theme';
import type { Paginated, TicketSummary } from '../types';
import { OutboxBanner } from './OutboxScreen';

interface MyDashboard {
  totalAssigned: number;
  newComplaints: number;
  resolved: number;
  pendingVisits: number;
  inProgress: number;
  visitedToday: number;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

/** The Service Engineer's own Home — today's numbers, quick actions, and the next job waiting. */
export function ServiceEngineerHomeScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { user } = useAuth();
  const dash = useQuery({ queryKey: ['service', 'my-dashboard', 'today'], queryFn: () => api.get<MyDashboard>('/service/my-dashboard', { period: 'today' }) });
  const next = useQuery({ queryKey: ['service-tickets', 'next'], queryFn: () => api.get<Paginated<TicketSummary>>('/service-tickets', { status: 'ASSIGNED', pageSize: 1 }) });
  const nextJob = next.data?.items[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={dash.isRefetching || next.isRefetching}
          onRefresh={() => {
            void dash.refetch();
            void next.refetch();
          }}
        />
      }
    >
      <OutboxBanner />
      <View style={styles.hero}>
        <Text style={styles.heroGreeting}>
          {greeting}, {user?.fullName?.split(' ')[0]}
        </Text>
        <Text style={styles.heroSub}>Service Engineer</Text>
      </View>

      {dash.isError ? <Text style={styles.error}>{errorText(dash.error, 'Could not load your numbers.')}</Text> : null}
      <View style={styles.statGrid}>
        <Stat label="Assigned" value={dash.data ? dash.data.pendingVisits + dash.data.inProgress : undefined} />
        <Stat label="Pending" value={dash.data?.pendingVisits} />
        <Stat label="Visited Today" value={dash.data?.visitedToday} />
        <Stat label="Resolved Today" value={dash.data?.resolved} tone={colors.success} />
      </View>

      <Text style={[text.h2, styles.section]}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionTile} onPress={() => navigation.navigate('Jobs')} accessibilityRole="button">
          <Text style={styles.actionGlyph}>▤</Text>
          <Text style={styles.actionLabel}>My Service Jobs</Text>
        </Pressable>
        <Pressable style={styles.actionTile} onPress={() => navigation.navigate('SpareParts')} accessibilityRole="button">
          <Text style={styles.actionGlyph}>◈</Text>
          <Text style={styles.actionLabel}>Parts Request</Text>
        </Pressable>
        <Pressable style={styles.actionTile} onPress={() => navigation.navigate('Jobs')} accessibilityRole="button">
          <Text style={styles.actionGlyph}>✎</Text>
          <Text style={styles.actionLabel}>Service Report</Text>
        </Pressable>
      </View>

      <Text style={[text.h2, styles.section]}>Next Service Visit</Text>
      {next.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.lg }} /> : null}
      {next.data && !nextJob ? (
        <Card>
          <Text style={text.muted}>No assigned jobs waiting right now.</Text>
        </Card>
      ) : null}
      {nextJob ? (
        <Card>
          <Text style={text.h2}>{nextJob.customer.name}</Text>
          {nextJob.productTitle ? <Text style={text.muted}>{nextJob.productTitle}</Text> : null}
          <Text style={text.muted} numberOfLines={2}>
            {nextJob.issueDescription}
          </Text>
          <View style={styles.actionsRow2}>
            <View style={styles.flex}>
              <Button title="View Job" onPress={() => navigation.navigate('Jobs', { screen: 'TicketDetail', params: { id: nextJob.id, no: nextJob.ticketNo } })} />
            </View>
            {nextJob.contactPhone ? (
              <View style={styles.flex}>
                <Button title="Call Customer" variant="secondary" onPress={() => void Linking.openURL(`tel:${digits(nextJob.contactPhone!)}`)} />
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value?: number; tone?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  hero: { backgroundColor: brand.blue, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  heroGreeting: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  heroSub: { fontSize: 13.5, color: '#dde2fb', marginTop: 2 },
  error: { color: colors.danger, marginBottom: space.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  statCard: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 11.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  section: { marginBottom: space.md },
  actionsRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  actionTile: { flex: 1, alignItems: 'center', gap: space.xs, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.lg },
  actionGlyph: { fontSize: 22, color: brand.blue },
  actionLabel: { fontSize: 11.5, fontWeight: '600', color: colors.text, textAlign: 'center', paddingHorizontal: 4 },
  actionsRow2: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  flex: { flex: 1 },
});
