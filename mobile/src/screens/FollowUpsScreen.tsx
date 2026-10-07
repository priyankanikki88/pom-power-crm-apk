import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Segmented } from '../components/inputs';
import { Empty } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/dates';
import type { FollowUpsStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import { STAGE_LABEL, TYPE_LABEL, type FollowUp, type FollowUpType, type FollowUpView, type FunnelStage, type Paginated } from '../types';

type ListView = FollowUpView | 'unplanned';
const VIEWS: Array<{ value: ListView; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'pending', label: 'All Pending' },
  { value: 'unplanned', label: 'Not Planned' },
];
const EMPTY: Record<FollowUpView, string> = { today: 'No follow-ups planned for today', overdue: 'Nothing is overdue', tomorrow: 'No follow-ups planned for tomorrow', pending: 'No pending follow-ups' };

interface UnplannedLead {
  customer: { id: string; name: string; customerCode: string; phone: string | null };
  stage: FunnelStage | null;
  owner: { id: string; fullName: string } | null;
  lastFollowUp: { id: string; completedAt: string | null; scheduledAt: string; outcome: string | null; type: FollowUpType } | null;
  followUpsDone: number;
  idleDays: number;
}

/** Open leads nobody is due to contact: no follow-up is planned for them. Tapping one plans it. */
function UnplannedList({ onPlan }: { onPlan?: (customer: { id: string; name: string }) => void }) {
  const list = useQuery({ queryKey: ['follow-ups', 'unplanned'], queryFn: () => api.get<Paginated<UnplannedLead>>('/follow-ups/unplanned', { pageSize: 100 }) });
  const items = list.data?.items ?? [];
  return (
    <>
      {list.isError ? <Text style={styles.error}>{list.error instanceof ApiError ? list.error.message : 'Could not load the list.'}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(l) => l.customer.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListHeaderComponent={items.length > 0 ? <Text style={styles.more}>Open leads with no follow-up planned — the longest idle first.{onPlan ? ' Tap one to plan it.' : ''}</Text> : null}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title="Every open lead has a follow-up planned" />}
        ListFooterComponent={list.data && list.data.total > items.length ? <Text style={styles.more}>Showing the first {items.length} of {list.data.total}.</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} disabled={!onPlan} onPress={() => onPlan?.({ id: item.customer.id, name: item.customer.name })} accessibilityRole="button">
            <View style={styles.itemHead}>
              <Text style={styles.name} numberOfLines={2}>
                {item.customer.name}
              </Text>
              <Text style={styles.type}>{item.stage ? STAGE_LABEL[item.stage] : ''}</Text>
            </View>
            <Text style={styles.when}>
              Idle for {item.idleDays} day{item.idleDays === 1 ? '' : 's'} · {item.followUpsDone} follow-up{item.followUpsDone === 1 ? '' : 's'} done
            </Text>
            <Text style={styles.meta} numberOfLines={2}>
              {item.lastFollowUp ? `Last: ${formatWhen(item.lastFollowUp.completedAt ?? item.lastFollowUp.scheduledAt)}${item.lastFollowUp.outcome ? ` — ${item.lastFollowUp.outcome}` : ''}` : 'No follow-up done yet'}
            </Text>
            {item.owner ? <Text style={styles.meta}>Sales person: {item.owner.fullName}</Text> : null}
          </Pressable>
        )}
      />
    </>
  );
}

/** My follow-ups by day bucket — the same buckets (and the same own-records scope) as the web CRM's Follow-ups page. */
export function FollowUpsScreen({ navigation }: NativeStackScreenProps<FollowUpsStackParams, 'FollowUpList'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('followup.manage');
  const [view, setView] = useState<ListView>('today');
  const list = useQuery({ queryKey: ['follow-ups', 'list', view], queryFn: () => api.get<Paginated<FollowUp>>('/follow-ups', { view, pageSize: 100 }), enabled: view !== 'unplanned' });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage
        ? () => (
            <Pressable onPress={() => navigation.navigate('FollowUpForm', {})} hitSlop={12} accessibilityRole="button" accessibilityLabel="Plan a follow-up">
              <Text style={styles.headerBtn}>+ New</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canManage]);

  const items = list.data?.items ?? [];
  if (view === 'unplanned') {
    return (
      <View style={styles.screen}>
        <View>
          <Segmented value={view} options={VIEWS} onChange={setView} />
        </View>
        <UnplannedList onPlan={canManage ? (customer) => navigation.navigate('FollowUpForm', { customer }) : undefined} />
      </View>
    );
  }
  return (
    <View style={styles.screen}>
      <View>
        <Segmented value={view} options={VIEWS} onChange={setView} />
      </View>
      {list.isError ? <Text style={styles.error}>{list.error instanceof ApiError ? list.error.message : 'Could not load follow-ups.'}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title={EMPTY[view as FollowUpView]} />}
        ListFooterComponent={list.data && list.data.total > items.length ? <Text style={styles.more}>Showing the first {items.length} of {list.data.total}.</Text> : null}
        renderItem={({ item }) => {
          const overdue = item.displayStatus === 'OVERDUE';
          return (
            <Pressable style={({ pressed }) => [styles.item, overdue && styles.itemOverdue, pressed && styles.pressed]} onPress={() => navigation.navigate('FollowUpDetail', { id: item.id })} accessibilityRole="button">
              <View style={styles.itemHead}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.customer.name}
                </Text>
                <Text style={[styles.type, overdue && { color: colors.danger }]}>{overdue ? 'Overdue' : TYPE_LABEL[item.type]}</Text>
              </View>
              <Text style={[styles.when, overdue && { color: colors.danger }]}>
                {formatWhen(item.scheduledAt)}
                {overdue ? ` · ${TYPE_LABEL[item.type]}` : ''}
              </Text>
              {item.purpose ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {item.purpose}
                </Text>
              ) : null}
              {item.contact ? <Text style={styles.meta}>Contact: {item.contact.name}</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  error: { color: colors.danger, paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  loading: { padding: space.xl },
  more: { textAlign: 'center', color: colors.muted, fontSize: 12.5, padding: space.md },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  itemOverdue: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  pressed: { opacity: 0.75 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  type: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  when: { fontSize: 13.5, fontWeight: '600', color: colors.text, marginTop: 2 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
