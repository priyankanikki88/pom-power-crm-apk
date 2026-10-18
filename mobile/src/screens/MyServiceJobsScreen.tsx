import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Empty } from '../components/ui';
import { api } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import { sendOrQueue } from '../lib/outbox';
import type { ServiceStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated, TicketSummary } from '../types';
import { SERVICE_TONE } from './ServiceScreen';

type Bucket = 'ASSIGNED' | 'IN_PROGRESS' | 'PENDING';
type TabKey = 'all' | Bucket;

const PRIORITY_TONE: Record<string, string> = { LOW: colors.muted, MEDIUM: colors.warning, HIGH: colors.danger, CRITICAL: colors.danger };
const TAB_LABEL: Record<TabKey, string> = { all: 'All', ASSIGNED: 'New', IN_PROGRESS: 'In Progress', PENDING: 'Pending' };

function useJobs(status: Bucket) {
  return useQuery({ queryKey: ['my-service-jobs', status], queryFn: () => api.get<Paginated<TicketSummary>>('/service-tickets', { status, pageSize: 100 }) });
}

/**
 * The signed-in engineer's own jobs, grouped the way field work actually moves: New (just assigned, not started) ->
 * In Progress -> Pending (waiting on something). "Accept" starts the job in place (same as TicketDetailScreen's own
 * "Start Work" button) without a detour through the detail screen first.
 */
export function MyServiceJobsScreen({ navigation }: NativeStackScreenProps<ServiceStackParams, 'ServiceHome'>) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('all');
  const assigned = useJobs('ASSIGNED');
  const inProgress = useJobs('IN_PROGRESS');
  const pending = useJobs('PENDING');
  const loading = assigned.isLoading || inProgress.isLoading || pending.isLoading;
  const refreshing = assigned.isRefetching || inProgress.isRefetching || pending.isRefetching;

  const buckets: Record<Bucket, TicketSummary[]> = { ASSIGNED: assigned.data?.items ?? [], IN_PROGRESS: inProgress.data?.items ?? [], PENDING: pending.data?.items ?? [] };
  const all = useMemo(
    () => [...buckets.ASSIGNED, ...buckets.IN_PROGRESS, ...buckets.PENDING].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assigned.data, inProgress.data, pending.data],
  );
  const items = tab === 'all' ? all : buckets[tab];
  const tabs: Array<{ key: TabKey; count: number }> = [
    { key: 'all', count: all.length },
    { key: 'ASSIGNED', count: buckets.ASSIGNED.length },
    { key: 'IN_PROGRESS', count: buckets.IN_PROGRESS.length },
    { key: 'PENDING', count: buckets.PENDING.length },
  ];

  const accept = useMutation({
    mutationFn: (t: TicketSummary) => sendOrQueue({ title: `Accept job ${t.ticketNo}`, method: 'POST', path: `/service-tickets/${t.id}/start`, body: undefined, refresh: ['my-service-jobs', 'service'] }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-service-jobs'] }),
  });

  function refresh() {
    void assigned.refetch();
    void inProgress.refetch();
    void pending.refetch();
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {TAB_LABEL[t.key]} ({t.count})
              </Text>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : <Empty title="No jobs here" />}
        renderItem={({ item: t }) => (
          <View style={[styles.card, (t.priority === 'CRITICAL' || t.priority === 'HIGH') && styles.urgent]}>
            <View style={styles.head}>
              <Text style={styles.no}>{t.ticketNo}</Text>
              <Text style={[styles.priority, { color: PRIORITY_TONE[t.priority] ?? colors.muted }]}>{enumLabel(t.priority)}</Text>
            </View>
            <Text style={styles.customer} numberOfLines={1}>
              {t.customer.name}
            </Text>
            {t.productTitle ? (
              <Text style={styles.meta} numberOfLines={1}>
                {t.productTitle}
              </Text>
            ) : null}
            <Text style={styles.meta} numberOfLines={2}>
              {t.issueDescription}
            </Text>
            <Text style={styles.meta}>
              {formatDate(t.createdAt)}
              {t.location ? ` · ${t.location}` : ''}
            </Text>
            <View style={styles.footer}>
              <Text style={[styles.status, { color: SERVICE_TONE[t.status] ?? colors.muted }]}>{enumLabel(t.status)}</Text>
              <View style={styles.actions}>
                <Pressable style={styles.btnGhost} onPress={() => navigation.navigate('TicketDetail', { id: t.id, no: t.ticketNo })} accessibilityRole="button" accessibilityLabel={`View ${t.ticketNo}`}>
                  <Text style={styles.btnGhostText}>View</Text>
                </Pressable>
                {t.status === 'ASSIGNED' ? (
                  <Pressable style={styles.btn} disabled={accept.isPending} onPress={() => accept.mutate(t)} accessibilityRole="button" accessibilityLabel={`Accept ${t.ticketNo}`}>
                    <Text style={styles.btnText}>{accept.isPending ? 'Accepting…' : 'Accept'}</Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.btn} onPress={() => navigation.navigate('TicketDetail', { id: t.id, no: t.ticketNo })} accessibilityRole="button" accessibilityLabel={`Update ${t.ticketNo}`}>
                    <Text style={styles.btnText}>Update</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.text },
  tabTextActive: { color: '#ffffff' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  loading: { padding: space.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md },
  urgent: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  no: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  priority: { fontSize: 12, fontWeight: '800' },
  customer: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  status: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.sm },
  btn: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  btnGhost: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
