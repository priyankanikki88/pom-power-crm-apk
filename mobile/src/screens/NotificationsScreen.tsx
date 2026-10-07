import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Segmented } from '../components/inputs';
import { Empty, ErrorBox } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/dates';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** The web CRM's route for what the notification is about, e.g. "/follow-ups/42". */
  link: string | null;
  readAt: string | null;
  createdAt: string;
  /** 1 = most urgent … 5 = informational (the server's ordering). */
  priority: number;
}
interface Page {
  items: AppNotification[];
  unread: number;
  total: number;
  page: number;
  pageSize: number;
}

/** How many notifications the signed-in user has not read. Checked again every minute while the app is open. */
export function useUnreadNotifications(): number {
  const q = useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'), refetchInterval: 60_000 });
  return q.data?.unread ?? 0;
}

type Target = { tab: string; screen: string; params: Record<string, string>; needs: string[] };

/** The app screen for a notification's link; null when that part of the CRM is on the web only (delegations). */
function targetOf(link: string | null): Target | null {
  if (!link) return null;
  const path = link.split('?')[0] ?? '';
  const id = /\/(\d+)$/.exec(path)?.[1];
  if (!id) return null;
  if (path.startsWith('/follow-ups/')) return { tab: 'FollowUps', screen: 'FollowUpDetail', params: { id }, needs: ['followup.read'] };
  if (path.startsWith('/format4/')) return { tab: 'Quotations', screen: 'DocDetail', params: { kind: 'FORMAT4', id, no: '' }, needs: ['format4.read', 'amc.read'] };
  if (path.startsWith('/proforma-invoices/')) return { tab: 'Quotations', screen: 'DocDetail', params: { kind: 'PROFORMA', id, no: '' }, needs: ['proforma.read', 'amc.read'] };
  if (path.startsWith('/service/tickets/')) return { tab: 'Service', screen: 'TicketDetail', params: { id, no: 'Ticket' }, needs: ['service.read'] };
  if (path.startsWith('/service/site-surveys/')) return { tab: 'Service', screen: 'SurveyDetail', params: { id, no: 'Site Survey' }, needs: ['service.read'] };
  if (path.startsWith('/expenses/')) return { tab: 'More', screen: 'ExpenseDetail', params: { id, no: 'Expense' }, needs: [] };
  if (path.startsWith('/meetings/')) return { tab: 'More', screen: 'MeetingDetail', params: { id, title: 'Meeting' }, needs: ['meeting.read'] };
  return null;
}

const TIER: Record<number, { label: string; color: string }> = {
  1: { label: 'Urgent', color: colors.danger },
  2: { label: 'Approval', color: colors.warning },
  3: { label: 'Overdue', color: colors.danger },
  4: { label: 'Today', color: colors.primaryDark },
};

/**
 * The CRM's notifications for the signed-in user — follow-ups due and overdue, approvals waiting, expense decisions,
 * service jobs — the same list as the bell on the web CRM. Tapping one marks it read and opens what it is about.
 */
export function NotificationsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Notifications'>) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<'all' | 'unread'>('all');
  const [note, setNote] = useState<string | null>(null);
  const list = useInfiniteQuery({
    queryKey: ['notifications', 'list', view],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Page>('/notifications', { unread: view === 'unread' ? 'true' : undefined, page: pageParam }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total && last.page < 50 ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.post('/notifications/read', ids ? { ids } : {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        unread > 0
          ? () => (
              <Pressable onPress={() => markRead.mutate(undefined)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mark all notifications read">
                <Text style={styles.headerBtn}>Mark all read</Text>
              </Pressable>
            )
          : undefined,
    });
    // markRead.mutate is stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, unread]);

  function open(n: AppNotification) {
    setNote(null);
    if (!n.readAt) markRead.mutate([n.id]);
    const target = targetOf(n.link);
    if (!target) {
      if (n.link) setNote('This one opens on the web CRM — that part is not in the app.');
      return;
    }
    if (target.needs.length > 0 && !target.needs.some((p) => hasPermission(p))) return setNote('Your role cannot open this in the app.');
    if (target.screen === 'MeetingDetail') navigation.navigate('MeetingDetail', { id: target.params.id!, title: target.params.title! });
    else if (target.tab === 'More') navigation.navigate('ExpenseDetail', { id: target.params.id!, no: target.params.no! });
    // `initial: false` keeps that tab's own list underneath, so Back goes to it.
    else navigation.getParent()?.navigate(target.tab, { screen: target.screen, params: target.params, initial: false });
  }

  return (
    <View style={styles.screen}>
      <View>
        <Segmented
          value={view}
          options={[
            { value: 'all' as const, label: 'All' },
            { value: 'unread' as const, label: unread > 0 ? `Unread (${unread})` : 'Unread' },
          ]}
          onChange={setView}
        />
      </View>
      {list.isError ? <View style={styles.pad}><ErrorBox message={list.error instanceof ApiError ? list.error.message : 'Could not load notifications.'} /></View> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void qc.invalidateQueries({ queryKey: ['notifications'] })} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title={view === 'unread' ? 'Nothing unread' : 'No notifications yet'} />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : null}
        renderItem={({ item }) => {
          const tier = TIER[item.priority];
          return (
            <Pressable style={({ pressed }) => [styles.item, !item.readAt && styles.unread, pressed && styles.pressed]} onPress={() => open(item)} accessibilityRole="button" accessibilityLabel={`${item.readAt ? '' : 'Unread. '}${item.title}`}>
              <View style={styles.row}>
                {tier ? <Text style={[styles.tier, { color: tier.color }]}>{tier.label}</Text> : <View />}
                <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
              </View>
              <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{item.title}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  headerBtn: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  note: { color: colors.warning, fontSize: 13, paddingHorizontal: space.lg, paddingBottom: space.sm },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  unread: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  tier: { fontSize: 12, fontWeight: '700' },
  when: { fontSize: 12, color: colors.muted },
  title: { fontSize: 14.5, color: colors.text },
  titleUnread: { fontWeight: '700' },
  body: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
