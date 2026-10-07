import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, Segmented } from '../components/inputs';
import { ReasonAction } from '../components/ReasonAction';
import { Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

interface Dispatch {
  id: string;
  dispatchNo: string;
  status: 'PREPARING' | 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED';
  dispatchDate: string | null;
  carrier: string | null;
  trackingNo: string | null;
  comments: string | null;
  order?: { id: string; orderNo: string };
  warehouse: { id: string; name: string; code: string } | null;
}
interface Order {
  id: string;
  orderNo: string;
  status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  orderDate: string;
  expectedDeliveryDate: string | null;
  customer: { id: string; customerCode: string; name: string };
}
interface OrderDetail extends Order {
  bill: { id: string; billNo: string; grandTotal: string } | null;
  items: Array<{ id: string; qty: string; productVariant: { id: string; productCode: string; sku: string | null } }>;
  dispatches: Dispatch[];
}

const TONE: Record<string, string> = { PENDING: colors.warning, PREPARING: colors.warning, CONFIRMED: colors.primaryDark, IN_PROGRESS: colors.primaryDark, DISPATCHED: colors.primaryDark, IN_TRANSIT: colors.primaryDark, DELIVERED: colors.success, CANCELLED: colors.danger, RETURNED: colors.danger };
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const PAGE_SIZE = 25;

function DispatchLines({ d }: { d: Dispatch }) {
  return (
    <>
      <View style={styles.row}>
        <Text style={styles.no}>{d.dispatchNo}</Text>
        <Text style={[styles.status, { color: TONE[d.status] ?? colors.muted }]}>{enumLabel(d.status)}</Text>
      </View>
      <Text style={text.muted}>
        {d.dispatchDate ? formatDate(d.dispatchDate) : 'Not dispatched yet'}
        {d.warehouse ? ` · from ${d.warehouse.name}` : ''}
      </Text>
      {d.carrier || d.trackingNo ? (
        <Text style={[text.body, styles.line]} selectable>
          {d.carrier ?? 'Carrier not entered'}
          {d.trackingNo ? ` · Tracking ${d.trackingNo}` : ''}
        </Text>
      ) : null}
      {d.comments ? <Text style={[text.muted, styles.line]}>{d.comments}</Text> : null}
    </>
  );
}

/**
 * Where a customer's material is: orders and their dispatches, to answer "has it left, who is carrying it, what is the
 * tracking number". An order is created from its bill; its steps are on the order page.
 */
export function OrdersScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Orders'>) {
  const { hasPermission } = useAuth();
  const canOrders = hasPermission('order.read');
  const canDispatches = hasPermission('dispatch.read');
  const [picked, setPicked] = useState<'orders' | 'dispatches'>('orders');
  const view = picked === 'orders' && !canOrders ? 'dispatches' : picked === 'dispatches' && !canDispatches ? 'orders' : picked;

  const orders = useInfiniteQuery({
    queryKey: ['orders', 'list'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Paginated<Order>>('/orders', { page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: canOrders,
  });
  const dispatches = useInfiniteQuery({
    queryKey: ['dispatches', 'list'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.get<Paginated<Dispatch>>('/dispatches', { page: pageParam, pageSize: PAGE_SIZE }),
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled: canDispatches,
  });
  const q = view === 'orders' ? orders : dispatches;
  const more = () => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  };

  return (
    <View style={styles.screen}>
      {canOrders && canDispatches ? (
        <View>
          <Segmented
            value={view}
            options={[
              { value: 'orders' as const, label: 'Orders' },
              { value: 'dispatches' as const, label: 'Dispatches' },
            ]}
            onChange={setPicked}
          />
        </View>
      ) : null}
      {q.isError ? <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load.')} /></View> : null}
      {view === 'orders' ? (
        <FlatList
          data={orders.data?.pages.flatMap((p) => p.items) ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={orders.isRefetching && !orders.isFetchingNextPage} onRefresh={() => void orders.refetch()} />}
          onEndReachedThreshold={0.4}
          onEndReached={more}
          ListEmptyComponent={orders.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No orders" />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('OrderDetail', { id: item.id, no: item.orderNo })} accessibilityRole="button">
              <View style={styles.row}>
                <Text style={styles.no}>{item.orderNo}</Text>
                <Text style={[styles.status, { color: TONE[item.status] ?? colors.muted }]}>{enumLabel(item.status)}</Text>
              </View>
              <Text style={styles.name}>{item.customer.name}</Text>
              <Text style={text.muted}>
                {formatDate(item.orderDate)}
                {item.expectedDeliveryDate ? ` · expected ${formatDate(item.expectedDeliveryDate)}` : ''}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={dispatches.data?.pages.flatMap((p) => p.items) ?? []}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={dispatches.isRefetching && !dispatches.isFetchingNextPage} onRefresh={() => void dispatches.refetch()} />}
          onEndReachedThreshold={0.4}
          onEndReached={more}
          ListEmptyComponent={dispatches.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No dispatches" />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.item, pressed && canOrders && styles.pressed]}
              disabled={!canOrders || !item.order}
              onPress={() => item.order && navigation.navigate('OrderDetail', { id: item.order.id, no: item.order.orderNo })}
              accessibilityRole="button"
            >
              <DispatchLines d={item} />
              {item.order ? <Text style={[text.muted, styles.line]}>Order {item.order.orderNo}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}


const ORDER_MOVES: Record<string, Array<{ status: string; title: string }>> = {
  PENDING: [{ status: 'CONFIRMED', title: 'Confirm Order' }, { status: 'CANCELLED', title: 'Cancel Order' }],
  CONFIRMED: [{ status: 'IN_PROGRESS', title: 'Start Processing' }, { status: 'CANCELLED', title: 'Cancel Order' }],
  IN_PROGRESS: [{ status: 'CANCELLED', title: 'Cancel Order' }],
};

/** Moving the order along, preparing a dispatch from a warehouse, and each dispatch's own steps — the web CRM's order page, for a role that may manage them. */
function OrderActions({ o }: { o: OrderDetail }) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const canOrder = hasPermission('order.manage');
  const canDispatch = hasPermission('dispatch.manage');
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const [carrier, setCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api.get<Array<{ id: string; name: string; code: string; active: boolean }>>('/warehouses'), enabled: preparing });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['dispatches'] });
  };
  const fail = (fallback: string) => (err: unknown) => setError(errorText(err, fallback));
  const move = useMutation({ mutationFn: (status: string) => api.patch(`/orders/${o.id}/status`, { status }), onSuccess: refresh, onError: fail('Could not change the order.') });
  const prepare = useMutation({
    mutationFn: () => api.post(`/orders/${o.id}/dispatches`, { warehouseId: warehouse, carrier: carrier.trim() || undefined, trackingNo: trackingNo.trim() || undefined }),
    onSuccess: () => {
      refresh();
      setPreparing(false);
      setCarrier('');
      setTrackingNo('');
    },
    onError: fail('Could not prepare the dispatch.'),
  });
  const step = useMutation({ mutationFn: ({ id, action, body }: { id: string; action: string; body?: unknown }) => api.post(`/dispatches/${id}/${action}`, body ?? {}), onSuccess: refresh, onError: fail('Could not update the dispatch.') });
  const busy = move.isPending || prepare.isPending || step.isPending;

  function confirm(title: string, message: string, run: () => void) {
    setError(null);
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', onPress: run },
    ]);
  }

  const moves = canOrder ? (ORDER_MOVES[o.status] ?? []) : [];
  const canPrepare = canDispatch && o.status === 'IN_PROGRESS' && hasPermission('inventory.read');
  const open = o.dispatches.filter((d) => d.status === 'PREPARING' || d.status === 'DISPATCHED' || d.status === 'IN_TRANSIT');
  if (moves.length === 0 && !canPrepare && !(canDispatch && open.length > 0)) return null;

  return (
    <Card>
      <Text style={[text.h2, styles.section]}>Next step</Text>
      {error ? <ErrorBox message={error} /> : null}
      {moves.map((mv) => (
        <View key={mv.status} style={styles.btn}>
          <Button title={mv.title} variant={mv.status === 'CANCELLED' ? 'secondary' : 'primary'} disabled={busy} loading={move.isPending && move.variables === mv.status} onPress={() => confirm(mv.title, `Order ${o.orderNo} will become “${enumLabel(mv.status)}”.${mv.status === 'CANCELLED' ? ' This cannot be undone.' : ''}`, () => move.mutate(mv.status))} />
        </View>
      ))}
      {canPrepare ? (
        preparing ? (
          <View style={styles.btn}>
            {warehouses.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
            <ChipSelect label="Dispatch from warehouse *" value={warehouse} options={(warehouses.data ?? []).filter((w) => w.active).map((w) => ({ value: w.id, label: w.name }))} onChange={setWarehouse} />
            <Field label="Carrier / transporter" value={carrier} onChangeText={setCarrier} />
            <Field label="Tracking / LR number" value={trackingNo} onChangeText={setTrackingNo} autoCapitalize="characters" />
            <Button
              title="Prepare Dispatch"
              loading={prepare.isPending}
              disabled={busy}
              onPress={() => {
                if (!warehouse) return setError('Choose the warehouse.');
                setError(null);
                prepare.mutate();
              }}
            />
            <View style={styles.gapSmall} />
            <Button title="Back" variant="secondary" onPress={() => setPreparing(false)} />
          </View>
        ) : (
          <View style={styles.btn}>
            <Button title="Prepare a Dispatch" disabled={busy} onPress={() => setPreparing(true)} />
          </View>
        )
      ) : null}
      {canDispatch
        ? open.map((d) => (
            <View key={d.id} style={styles.dispatch}>
              <Text style={styles.no}>
                {d.dispatchNo} · {enumLabel(d.status)}
              </Text>
              {d.status === 'PREPARING' ? (
                <View style={styles.btn}>
                  <Button title="Confirm Dispatch (stock goes out)" disabled={busy} onPress={() => confirm('Confirm this dispatch?', `${d.dispatchNo}: the stock is taken out of ${d.warehouse?.name ?? 'the warehouse'}. Serial numbers, when needed, are entered on the web CRM.`, () => step.mutate({ id: d.id, action: 'confirm' }))} />
                </View>
              ) : null}
              {d.status === 'DISPATCHED' ? (
                <View style={styles.btn}>
                  <Button title="Mark In Transit" variant="secondary" disabled={busy} onPress={() => confirm('Mark in transit?', `${d.dispatchNo} is on its way to the customer.`, () => step.mutate({ id: d.id, action: 'in-transit' }))} />
                </View>
              ) : null}
              {d.status === 'DISPATCHED' || d.status === 'IN_TRANSIT' ? (
                <>
                  <View style={styles.btn}>
                    <Button title="Mark Delivered" disabled={busy} onPress={() => confirm('Mark delivered?', `${d.dispatchNo} has reached the customer.`, () => step.mutate({ id: d.id, action: 'delivered' }))} />
                  </View>
                  <View style={styles.btn}>
                    <ReasonAction title="Returned" label="Why did it come back" confirmTitle="Mark Returned (stock comes back)" danger busy={step.isPending} disabled={busy} onSubmit={(comments) => step.mutate({ id: d.id, action: 'returned', body: { comments } })} />
                  </View>
                </>
              ) : null}
            </View>
          ))
        : null}
    </Card>
  );
}

export function OrderDetailScreen({ route }: NativeStackScreenProps<MoreStackParams, 'OrderDetail'>) {
  const q = useQuery({ queryKey: ['orders', 'one', route.params.id], queryFn: () => api.get<OrderDetail>(`/orders/${route.params.id}`) });
  const o = q.data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.pad} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this order.')} /> : null}
      {o ? (
        <>
          <Card>
            <View style={styles.row}>
              <Text style={[text.h1, styles.flex]}>{o.orderNo}</Text>
              <Text style={[styles.status, { color: TONE[o.status] ?? colors.muted }]}>{enumLabel(o.status)}</Text>
            </View>
            <Text style={[text.h2, styles.customer]}>{o.customer.name}</Text>
            <Row label="Order date" value={formatDate(o.orderDate)} />
            <Row label="Expected delivery" value={formatDate(o.expectedDeliveryDate)} />
            <Row label="Bill" value={o.bill ? `${o.bill.billNo} · ${formatINR(o.bill.grandTotal)}` : null} />
          </Card>
          <OrderActions o={o} />
          <Card>
            <Text style={[text.h2, styles.section]}>Items ({o.items.length})</Text>
            {o.items.map((it) => (
              <View key={it.id} style={styles.entry}>
                <Text style={[text.body, styles.flex]}>{it.productVariant.productCode}</Text>
                <Text style={text.body}>Qty {Number(it.qty).toLocaleString('en-IN')}</Text>
              </View>
            ))}
          </Card>
          <Card>
            <Text style={[text.h2, styles.section]}>Dispatches ({o.dispatches.length})</Text>
            {o.dispatches.length === 0 ? <Text style={text.muted}>Nothing has been dispatched for this order yet.</Text> : null}
            {o.dispatches.map((d) => (
              <View key={d.id} style={styles.dispatch}>
                <DispatchLines d={d} />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg },
  list: { padding: space.lg, flexGrow: 1 },
  flex: { flex: 1 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  no: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  status: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, marginVertical: 3 },
  customer: { marginTop: 2, marginBottom: space.sm },
  line: { marginTop: 2 },
  section: { marginBottom: space.sm },
  btn: { marginTop: space.sm },
  gapSmall: { height: space.sm },
  entry: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dispatch: { paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  foot: { textAlign: 'center', marginVertical: space.lg },
});
