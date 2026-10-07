import { useInfiniteQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Segmented } from '../components/inputs';
import { Empty } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { ServiceStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import { SURVEY_LABEL, type InstallationSummary, type Paginated, type Revisit, type SiteSurvey, type TicketSummary, type WarrantySummary } from '../types';

type Kind = 'TICKETS' | 'INSTALLATIONS' | 'REVISITS' | 'SURVEYS' | 'WARRANTY';
const PAGE_SIZE = 25;

export const SERVICE_TONE: Record<string, string> = {
  OPEN: colors.warning,
  ASSIGNED: colors.primaryDark,
  IN_PROGRESS: colors.primaryDark,
  PENDING: colors.warning,
  REVISIT_REQUIRED: colors.warning,
  RESOLVED: colors.success,
  CLOSED: colors.muted,
  CANCELLED: colors.danger,
  SCHEDULED: colors.primaryDark,
  COMPLETED: colors.success,
  ACTIVE: colors.success,
  EXPIRED: colors.danger,
  VOIDED: colors.muted,
  CRITICAL: colors.danger,
  HIGH: colors.danger,
};

/** Filters per list: each is just query parameters of the same endpoint the web CRM's list page uses. */
const FILTERS: Record<Kind, Array<{ value: string; label: string; query: Record<string, string> }>> = {
  TICKETS: [
    { value: 'open', label: 'Open', query: { open: 'true' } },
    { value: 'PENDING', label: 'On Hold', query: { status: 'PENDING' } },
    { value: 'RESOLVED', label: 'Resolved', query: { status: 'RESOLVED' } },
    { value: 'all', label: 'All', query: {} },
  ],
  INSTALLATIONS: [
    { value: 'SCHEDULED', label: 'Scheduled', query: { status: 'SCHEDULED' } },
    { value: 'IN_PROGRESS', label: 'In Progress', query: { status: 'IN_PROGRESS' } },
    { value: 'COMPLETED', label: 'Completed', query: { status: 'COMPLETED' } },
    { value: 'all', label: 'All', query: {} },
  ],
  REVISITS: [
    { value: 'SCHEDULED', label: 'Scheduled', query: { status: 'SCHEDULED' } },
    { value: 'COMPLETED', label: 'Completed', query: { status: 'COMPLETED' } },
    { value: 'all', label: 'All', query: {} },
  ],
  SURVEYS: [
    { value: 'SCHEDULED', label: 'Scheduled', query: { status: 'SCHEDULED' } },
    { value: 'COMPLETED', label: 'Completed', query: { status: 'COMPLETED' } },
    { value: 'all', label: 'All', query: {} },
  ],
  WARRANTY: [
    { value: 'all', label: 'All', query: {} },
    { value: 'ACTIVE', label: 'Active', query: { status: 'ACTIVE' } },
    { value: 'EXPIRING', label: 'Expiring (30 days)', query: { status: 'EXPIRING' } },
    { value: 'EXPIRED', label: 'Expired', query: { status: 'EXPIRED' } },
  ],
};
const PATH: Record<Kind, string> = { TICKETS: '/service-tickets', INSTALLATIONS: '/installations', REVISITS: '/service-revisits', SURVEYS: '/site-surveys', WARRANTY: '/warranties' };
const SEARCHABLE: Record<Kind, string | null> = { TICKETS: 'Ticket no., customer, serial…', INSTALLATIONS: 'Installation no., customer, serial…', REVISITS: null, SURVEYS: 'Survey no., customer…', WARRANTY: 'Serial number, customer…' };

type Item = TicketSummary | InstallationSummary | Revisit | SiteSurvey | WarrantySummary;

/** The Service tab: tickets, installations, revisits, site surveys and warranty lookup. The server limits an engineer to their own jobs. */
export function ServiceScreen({ navigation }: NativeStackScreenProps<ServiceStackParams, 'ServiceHome'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('service.manage');
  const kinds: Array<{ value: Kind; label: string }> = [
    ...(hasPermission('service.read') ? ([{ value: 'TICKETS', label: 'Tickets' }, { value: 'INSTALLATIONS', label: 'Installations' }, { value: 'REVISITS', label: 'Revisits' }, { value: 'SURVEYS', label: 'Site Surveys' }] as const) : []),
    ...(hasPermission('warranty.read') ? ([{ value: 'WARRANTY', label: 'Warranty' }] as const) : []),
  ];
  const [picked, setPicked] = useState<Kind>('TICKETS');
  const kind = kinds.some((k) => k.value === picked) ? picked : (kinds[0]?.value ?? 'TICKETS');
  const [filter, setFilter] = useState(FILTERS[kind][0]!.value);
  const activeFilter = FILTERS[kind].find((f) => f.value === filter) ?? FILTERS[kind][0]!;
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  useLayoutEffect(() => {
    const add = kind === 'TICKETS' ? { label: '+ Complaint', go: () => navigation.navigate('TicketForm') } : kind === 'SURVEYS' ? { label: '+ Survey', go: () => navigation.navigate('SurveyForm') } : null;
    navigation.setOptions({
      headerRight:
        canManage && add
          ? () => (
              <Pressable onPress={add.go} hitSlop={12} accessibilityRole="button" accessibilityLabel={add.label}>
                <Text style={styles.headerBtn}>{add.label}</Text>
              </Pressable>
            )
          : undefined,
    });
  }, [navigation, canManage, kind]);

  const list = useInfiniteQuery({
    queryKey: ['service', 'list', kind, activeFilter.value, search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Paginated<Item>>(PATH[kind], { ...activeFilter.query, search: SEARCHABLE[kind] && search ? search : undefined, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: kinds.length > 0,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  function renderItem(item: Item) {
    if (kind === 'TICKETS') {
      const t = item as TicketSummary;
      return row(t.ticketNo, t.status, t.customer.name, [t.productTitle, t.issueDescription, `${enumLabel(t.priority)} priority${t.assignedEngineer ? ` · ${t.assignedEngineer.name}` : ' · Not assigned'}`], () => navigation.navigate('TicketDetail', { id: t.id, no: t.ticketNo }), t.priority === 'CRITICAL' || t.priority === 'HIGH');
    }
    if (kind === 'INSTALLATIONS') {
      const i = item as InstallationSummary;
      return row(i.installationNo ?? 'Installation', i.status, i.customer.name, [i.productTitle, i.installationDate ? `Planned ${formatDate(i.installationDate)}` : 'No date set', i.engineer ? i.engineer.name : 'Not assigned'], () => navigation.navigate('InstallationDetail', { id: i.id, no: i.installationNo ?? 'Installation' }));
    }
    if (kind === 'REVISITS') {
      const r = item as Revisit;
      return row(r.ticket?.ticketNo ?? 'Revisit', r.status, r.ticket?.customer.name ?? '', [`Visit ${formatDate(r.visitDate)}`, r.reason, r.engineer?.name ?? 'Not assigned'], () => navigation.navigate('TicketDetail', { id: r.ticketId, no: r.ticket?.ticketNo ?? 'Ticket' }));
    }
    if (kind === 'SURVEYS') {
      const s = item as SiteSurvey;
      return row(s.surveyNo, s.status, s.customer.name, [SURVEY_LABEL[s.surveyType], `Survey ${formatDate(s.surveyDate)}`, s.engineer?.name ?? 'Not assigned'], () => navigation.navigate('SurveyDetail', { id: s.id, no: s.surveyNo }));
    }
    const w = item as WarrantySummary;
    return row(w.serialNo ?? 'No serial', w.effectiveStatus, w.customer.name, [w.productTitle, `${formatDate(w.warrantyStart)} – ${formatDate(w.warrantyEnd)}`, w.effectiveStatus === 'ACTIVE' ? `${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'} left` : null, w.endCustomerName ? `End customer: ${w.endCustomerName}` : null]);
  }

  function row(no: string, status: string, name: string, lines: Array<string | null>, onPress?: () => void, urgent = false) {
    const body = (
      <>
        <View style={styles.itemHead}>
          <Text style={styles.no}>{no}</Text>
          <Text style={[styles.status, { color: SERVICE_TONE[status] ?? colors.muted }]}>{enumLabel(status)}</Text>
        </View>
        {name ? (
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
        ) : null}
        {lines.filter(Boolean).map((l, i) => (
          <Text key={i} style={styles.meta} numberOfLines={2}>
            {l}
          </Text>
        ))}
      </>
    );
    return onPress ? (
      <Pressable style={({ pressed }) => [styles.item, urgent && styles.urgent, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
        {body}
      </Pressable>
    ) : (
      <View style={styles.item}>{body}</View>
    );
  }

  if (kinds.length === 0) return <Empty title="Your role does not include service work" />;
  return (
    <View style={styles.screen}>
      <View>
        <Segmented
          value={kind}
          options={kinds}
          onChange={(k) => {
            setPicked(k);
            setFilter(FILTERS[k][0]!.value);
            setInput('');
          }}
        />
      </View>
      {SEARCHABLE[kind] ? (
        <View style={styles.searchBox}>
          <TextInput value={input} onChangeText={setInput} placeholder={SEARCHABLE[kind]!} placeholderTextColor={colors.muted} style={styles.search} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search" />
        </View>
      ) : null}
      <View>
        <Segmented value={activeFilter.value} options={FILTERS[kind]} onChange={setFilter} />
      </View>
      {list.isError ? <Text style={styles.error}>{list.error instanceof ApiError ? list.error.message : 'Could not load the list.'}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title="Nothing here" hint={kind === 'WARRANTY' ? 'Search by serial number to check a warranty.' : undefined} />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}
        renderItem={({ item }) => renderItem(item)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  searchBox: { paddingHorizontal: space.lg, paddingTop: space.sm },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  error: { color: colors.danger, paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  loading: { padding: space.xl },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  urgent: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  pressed: { opacity: 0.75 },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  no: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  status: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, marginVertical: 3 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 1 },
});
