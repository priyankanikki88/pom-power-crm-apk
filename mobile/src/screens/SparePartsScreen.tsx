import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Segmented } from '../components/inputs';
import { Badge, Button, Card, Empty, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated, TicketSummary } from '../types';

interface EngineerStockRow {
  id: string;
  quantityOnHand: string;
  updatedAt: string;
  productVariant: { id: string; productCode: string; sku: string } | null;
}
interface StockIssueRow {
  id: string;
  qtyRequested: string;
  qtyIssued: string | null;
  status: 'REQUESTED' | 'ISSUED' | 'CLOSED' | 'CANCELLED';
  remarks: string | null;
  requestedAt: string;
  ticket: { id: string; ticketNo: string; customer: { name: string } };
  productVariant: { id: string; productCode: string; sku: string } | null;
}
interface ServiceMe {
  engineerId: string | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const STATUS_TONE: Record<string, string> = { REQUESTED: colors.warning, ISSUED: colors.primaryDark, CLOSED: colors.success, CANCELLED: colors.muted };
/** No reorder threshold is kept for an engineer's own holding — this is an on-device approximation, not a stocked value. */
const LOW_STOCK_AT = 2;

type Tab = 'stock' | 'history';

/** My Stock (what the engineer is currently holding) and Request History — Service Inventory, from the engineer's own side. */
export function SparePartsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'SpareParts'>) {
  const [tab, setTab] = useState<Tab>('stock');
  const me = useQuery({ queryKey: ['service', 'me'], queryFn: () => api.get<ServiceMe>('/service/me') });
  const engineerId = me.data?.engineerId;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('SparePartsForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Request parts">
          <Text style={styles.headerBtn}>+ Request</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const stock = useQuery({ queryKey: ['service-stock', 'mine', engineerId], queryFn: () => api.get<EngineerStockRow[]>(`/service-stock-issues/engineers/${engineerId}/stock`), enabled: !!engineerId });
  const history = useQuery({ queryKey: ['service-stock-issues', 'mine', engineerId], queryFn: () => api.get<Paginated<StockIssueRow>>('/service-stock-issues', { engineerId, pageSize: 100 }), enabled: !!engineerId });

  return (
    <View style={styles.screen}>
      <Segmented value={tab} options={[{ value: 'stock', label: 'My Stock' }, { value: 'history', label: 'Request History' }]} onChange={setTab} />
      {tab === 'stock' ? (
        <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={stock.isRefetching} onRefresh={() => void stock.refetch()} />}>
          {stock.isLoading || me.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
          {stock.isError ? <ErrorBox message={errorText(stock.error, 'Could not load your stock.')} /> : null}
          {stock.data && stock.data.length === 0 ? <Empty title="No parts in hand right now" /> : null}
          {(stock.data ?? []).map((r) => {
            const qty = Number(r.quantityOnHand);
            const low = qty > 0 && qty <= LOW_STOCK_AT;
            return (
              <View key={r.id} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={text.body}>{r.productVariant?.productCode ?? r.productVariant?.sku ?? 'Part'}</Text>
                  <Text style={text.muted}>Updated {formatDate(r.updatedAt)}</Text>
                </View>
                <Text style={text.h2}>{qty}</Text>
                <Badge value={low ? 'LOW' : 'ACTIVE'} label={low ? 'Low Stock' : 'Available'} />
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={history.isRefetching} onRefresh={() => void history.refetch()} />}>
          {history.isLoading || me.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
          {history.isError ? <ErrorBox message={errorText(history.error, 'Could not load your requests.')} /> : null}
          {history.data && history.data.items.length === 0 ? <Empty title="No parts requested yet" /> : null}
          {(history.data?.items ?? []).map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={text.body}>{r.productVariant?.productCode ?? r.productVariant?.sku ?? 'Part'}</Text>
                <Badge value={r.status} label={enumLabel(r.status)} />
              </View>
              <Text style={text.muted}>
                {r.ticket.ticketNo} · {r.ticket.customer.name}
              </Text>
              <Text style={text.muted}>
                Qty {r.qtyRequested}
                {r.qtyIssued ? ` · Issued ${r.qtyIssued}` : ''} · {formatDate(r.requestedAt)}
              </Text>
              {r.remarks ? (
                <Text style={text.muted} numberOfLines={2}>
                  {r.remarks}
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** Request a spare part / replacement unit for one of the engineer's own open jobs. */
export function SparePartsFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'SparePartsForm'>) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['service', 'me'], queryFn: () => api.get<ServiceMe>('/service/me') });
  const jobs = useQuery({ queryKey: ['service-tickets', 'open-for-parts'], queryFn: () => api.get<Paginated<TicketSummary>>('/service-tickets', { open: 'true', pageSize: 100 }) });
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [partSearch, setPartSearch] = useState('');
  const [partTerm, setPartTerm] = useState('');
  const [part, setPart] = useState<{ id: string; title: string } | null>(null);
  const [qty, setQty] = useState('1');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setPartTerm(partSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [partSearch]);
  const options = useQuery({
    queryKey: ['products', 'picker', partTerm],
    queryFn: () => api.get<Paginated<{ id: string; productCode: string; sku: string; productName: string | null; model: { name: string } }>>('/products', { search: partTerm, active: 'true', pageSize: 10 }),
    enabled: partTerm.length > 0 && !part,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/service-stock-issues', {
        serviceTicketId: ticketId,
        productVariantId: part?.id,
        engineerId: me.data?.engineerId,
        qty: Number(qty),
        remarks: remarks.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['service-stock-issues'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not send the request.')),
  });

  function submit() {
    if (!ticketId) return setError('Choose which job this is for.');
    if (!part) return setError('Choose a part.');
    if (!(Number(qty) > 0)) return setError('Enter a valid quantity.');
    setError(null);
    create.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Text style={styles.label}>For job *</Text>
        {jobs.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        <View style={styles.jobList}>
          {(jobs.data?.items ?? []).map((t) => (
            <Pressable key={t.id} style={[styles.jobRow, ticketId === t.id && styles.jobRowOn]} onPress={() => setTicketId(t.id)} accessibilityRole="button">
              <Text style={[styles.jobText, ticketId === t.id && styles.jobTextOn]} numberOfLines={1}>
                {t.ticketNo} · {t.customer.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Part *</Text>
        {part ? (
          <View style={styles.selectedPart}>
            <Text style={text.body}>{part.title}</Text>
            <Pressable onPress={() => setPart(null)} accessibilityRole="button" accessibilityLabel="Change part">
              <Text style={styles.change}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput style={styles.input} placeholder="Search part / product" placeholderTextColor={colors.muted} value={partSearch} onChangeText={setPartSearch} />
            {(options.data?.items ?? []).map((v) => (
              <Pressable
                key={v.id}
                style={styles.result}
                onPress={() => {
                  setPart({ id: v.id, title: v.productName ?? v.model.name });
                  setPartSearch('');
                }}
                accessibilityRole="button"
              >
                <Text style={text.body}>{v.productName ?? v.model.name}</Text>
                <Text style={text.muted}>{v.productCode}</Text>
              </Pressable>
            ))}
          </>
        )}

        <Field label="Quantity *" value={qty} onChangeText={setQty} keyboardType="numeric" />
        <Field label="Reason" value={remarks} onChangeText={setRemarks} multiline maxLength={1000} placeholder="e.g. Customer reported low backup time" />
        <Button title="Submit Request" onPress={submit} loading={create.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  list: { padding: space.lg, flexGrow: 1 },
  pad: { padding: space.lg },
  loading: { padding: space.xl },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs, marginTop: space.sm },
  jobList: { gap: space.xs, marginBottom: space.sm },
  jobRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  jobRowOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  jobText: { fontSize: 14, color: colors.text },
  jobTextOn: { color: colors.primaryDark, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface, marginBottom: space.sm },
  result: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  selectedPart: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  change: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
});
