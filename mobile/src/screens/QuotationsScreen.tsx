import { useInfiniteQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { STATUS_TONE } from '../components/docParts';
import { Segmented } from '../components/inputs';
import { Empty } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import type { QuotationsStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import { manageableTypes } from '../lib/sales';
import type { BillSummary, Paginated, QuotationSummary, SalesDoc } from '../types';

const PAGE_SIZE = 25;
export type DocKind = 'QUOTATION' | 'PROFORMA' | 'FORMAT4' | 'BILL';

const KIND: Record<DocKind, { label: string; path: string; read: string[]; statuses: string[]; placeholder: string }> = {
  QUOTATION: { label: 'Quotations', path: '/quotations', read: ['quotation.read', 'amc.read'], statuses: ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'], placeholder: 'Search quotation no., customer…' },
  PROFORMA: { label: 'Proforma', path: '/proforma-invoices', read: ['proforma.read', 'amc.read'], statuses: ['DRAFT', 'APPROVAL_PENDING', 'APPROVED', 'SENT', 'FINAL'], placeholder: 'Search proforma no., customer…' },
  FORMAT4: { label: 'Format-4', path: '/format4', read: ['format4.read', 'amc.read'], statuses: ['DRAFT', 'APPROVAL_PENDING', 'APPROVED', 'FINAL', 'REJECTED'], placeholder: 'Search Format-4 no., customer…' },
  BILL: { label: 'Bills', path: '/bills', read: ['bill.read'], statuses: ['DRAFT', 'FINAL', 'SENT', 'CANCELLED'], placeholder: 'Search bill no., customer…' },
};
/** What "+ New" makes on each tab; a bill is only ever raised from its approved Format-4. */
const NEW: Record<DocKind, { label: string; mode: 'QUOTATION' | 'PROFORMA' | 'FORMAT4'; module: 'quotation' | 'proforma' | 'format4' } | null> = {
  QUOTATION: { label: '+ Quote', mode: 'QUOTATION', module: 'quotation' },
  PROFORMA: { label: '+ Direct PI', mode: 'PROFORMA', module: 'proforma' },
  FORMAT4: { label: '+ Direct F-4', mode: 'FORMAT4', module: 'format4' },
  BILL: null,
};

interface ListRow {
  id: string;
  no: string;
  status: string;
  date: string;
  grandTotal: string;
  customerName: string;
}
const toRow = (kind: DocKind, x: QuotationSummary | SalesDoc | BillSummary): ListRow =>
  kind === 'BILL'
    ? { id: x.id, no: (x as BillSummary).billNo, status: x.status, date: (x as BillSummary).billDate, grandTotal: x.grandTotal, customerName: x.customer.name }
    : kind === 'QUOTATION'
    ? { id: x.id, no: (x as QuotationSummary).quotationNo, status: x.status, date: (x as QuotationSummary).quotationDate, grandTotal: x.grandTotal, customerName: x.customer.name }
    : { id: x.id, no: ((kind === 'PROFORMA' ? (x as SalesDoc).proformaNo : (x as SalesDoc).format4No) ?? ''), status: x.status, date: (x as SalesDoc).issueDate ?? (x as SalesDoc).createdAt, grandTotal: x.grandTotal, customerName: x.customer.name };

/** The Sales tab: quotations, proforma invoices, Format-4 documents and bills the user may see, newest first, by status and search. */
export function QuotationsScreen({ navigation }: NativeStackScreenProps<QuotationsStackParams, 'QuotationList'>) {
  const { hasPermission } = useAuth();
  const kinds = (Object.keys(KIND) as DocKind[]).filter((k) => KIND[k].read.some((p) => hasPermission(p)));
  const [picked, setPicked] = useState<DocKind>('QUOTATION');
  const kind = kinds.includes(picked) ? picked : (kinds[0] ?? 'QUOTATION');
  const cfg = KIND[kind];
  const [status, setStatus] = useState('ALL');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  // "+ New" follows the tab: a quotation, a direct proforma, or a direct / paid Format-4 (each as product sales or AMC).
  const create = NEW[kind];
  const canCreate = create !== null && manageableTypes(hasPermission, create.module).length > 0 && hasPermission('product.read');
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        canCreate && create
          ? () => (
              <Pressable onPress={() => navigation.navigate('QuotationForm', { mode: create.mode })} hitSlop={12} accessibilityRole="button" accessibilityLabel={`New: ${create.label.slice(2)}`}>
                <Text style={styles.headerBtn}>{create.label}</Text>
              </Pressable>
            )
          : undefined,
    });
  }, [navigation, canCreate, create]);

  const list = useInfiniteQuery({
    queryKey: [kind === 'QUOTATION' ? 'quotations' : kind === 'BILL' ? 'bills' : 'sales-docs', kind, status, search],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Paginated<QuotationSummary | SalesDoc | BillSummary>>(cfg.path, { search: search || undefined, status: status === 'ALL' ? undefined : status, page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items).map((x) => toRow(kind, x)) ?? [];

  return (
    <View style={styles.screen}>
      {kinds.length > 1 ? (
        <View>
          <Segmented
            value={kind}
            options={kinds.map((k) => ({ value: k, label: KIND[k].label }))}
            onChange={(k) => {
              setPicked(k);
              setStatus('ALL');
            }}
          />
        </View>
      ) : null}
      <View style={styles.searchBox}>
        <TextInput value={input} onChangeText={setInput} placeholder={cfg.placeholder} placeholderTextColor={colors.muted} style={styles.search} autoCapitalize="none" autoCorrect={false} accessibilityLabel={`Search ${cfg.label}`} />
      </View>
      <View>
        <Segmented value={status} options={[{ value: 'ALL', label: 'All' }, ...cfg.statuses.map((s) => ({ value: s, label: enumLabel(s) }))]} onChange={setStatus} />
      </View>
      {list.isError ? <Text style={styles.error}>{list.error instanceof ApiError ? list.error.message : `Could not load ${cfg.label.toLowerCase()}.`}</Text> : null}
      <FlatList
        data={items}
        keyExtractor={(q) => q.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title={`No ${cfg.label.toLowerCase()} found`} />}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={() => (kind === 'QUOTATION' ? navigation.navigate('QuotationDetail', { id: item.id, no: item.no }) : kind === 'BILL' ? navigation.navigate('BillDetail', { id: item.id, no: item.no }) : navigation.navigate('DocDetail', { kind, id: item.id, no: item.no }))}
            accessibilityRole="button"
          >
            <View style={styles.itemHead}>
              <Text style={styles.no}>{item.no}</Text>
              <Text style={[styles.status, { color: STATUS_TONE[item.status] ?? colors.muted }]}>{enumLabel(item.status)}</Text>
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {item.customerName}
            </Text>
            <View style={styles.itemHead}>
              <Text style={styles.meta}>{formatDate(item.date)}</Text>
              <Text style={styles.amount}>{formatINR(item.grandTotal)}</Text>
            </View>
          </Pressable>
        )}
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
  pressed: { opacity: 0.75 },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  no: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  status: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, marginVertical: 3 },
  meta: { fontSize: 13, color: colors.muted },
  amount: { fontSize: 14.5, fontWeight: '700', color: colors.text },
});
