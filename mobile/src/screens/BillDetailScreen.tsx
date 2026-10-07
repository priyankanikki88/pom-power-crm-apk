import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ItemsCard, PdfButton, STATUS_TONE, TotalsCard } from '../components/docParts';
import { PaymentSection } from '../components/PaymentSection';
import { Button, Card, ErrorBox, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { QuotationsStackParams } from '../navigation';
import { colors, space } from '../theme';
import type { BillDetail } from '../types';

/** Same status moves as the web CRM's bill page. */
const TRANSITIONS: Record<string, string[]> = { DRAFT: ['FINAL', 'CANCELLED'], FINAL: ['SENT'] };
const ACTION: Record<string, string> = { FINAL: 'Mark as Final', SENT: 'Mark as Sent', CANCELLED: 'Cancel Bill' };
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** One bill: the Format-4 it was raised from, items, totals and PDF; status moves; payments; and creating its order for dispatch. */
export function BillDetailScreen({ route, navigation }: NativeStackScreenProps<QuotationsStackParams, 'BillDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['bill', id], queryFn: () => api.get<BillDetail>(`/bills/${id}`) });
  const d = q.data;
  const [error, setError] = useState<string | null>(null);

  const changeStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/bills/${id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bill', id] });
      void qc.invalidateQueries({ queryKey: ['bills'] });
      void qc.invalidateQueries({ queryKey: ['sales-doc'] });
    },
    onError: (err) => setError(errorText(err, 'Could not change the status.')),
  });

  // Fulfilment starts from a finalised bill: the order carries its items to dispatch.
  const createOrder = useMutation({
    mutationFn: () => api.post<{ id: string; orderNo: string }>('/orders', { billId: id }),
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      navigation.getParent()?.navigate('More', { screen: 'OrderDetail', params: { id: order.id, no: order.orderNo }, initial: false });
    },
    onError: (err) => setError(errorText(err, 'Could not create the order.')),
  });
  const canOrder = d && (d.status === 'FINAL' || d.status === 'SENT') && hasPermission('order.manage');
  const moves = d && hasPermission('bill.manage') ? (TRANSITIONS[d.status] ?? []) : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this bill.')} /> : null}
      {d ? (
        <>
          <Card>
            <View style={styles.head}>
              <Text style={[text.h1, styles.flex]}>{d.billNo}</Text>
              <Text style={[styles.status, { color: STATUS_TONE[d.status] ?? colors.muted }]}>{enumLabel(d.status)}</Text>
            </View>
            <Text style={[text.h2, styles.customer]}>{d.customer.name}</Text>
            <Row label="Bill date" value={formatDate(d.billDate)} />
            <Row
              label="Format-4"
              value={
                hasPermission('format4.read') || hasPermission('amc.read') ? (
                  <Pressable onPress={() => navigation.push('DocDetail', { kind: 'FORMAT4', id: d.format4Document.id, no: d.format4Document.format4No })} accessibilityRole="button">
                    <Text style={styles.linkText}>{d.format4Document.format4No}</Text>
                  </Pressable>
                ) : (
                  d.format4Document.format4No
                )
              }
            />
            <PdfButton path={`/bills/${id}/pdf`} fileName={d.billNo} title={`Bill ${d.billNo}`} />
          </Card>

          {error ? <ErrorBox message={error} /> : null}

          {moves.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Next step</Text>
              {moves.map((st) => (
                <View key={st} style={styles.btn}>
                  <Button
                    title={ACTION[st] ?? enumLabel(st)}
                    variant={st === 'CANCELLED' ? 'secondary' : 'primary'}
                    loading={changeStatus.isPending && changeStatus.variables === st}
                    disabled={changeStatus.isPending}
                    onPress={() => {
                      setError(null);
                      Alert.alert(ACTION[st] ?? enumLabel(st), `Bill ${d.billNo} will become “${enumLabel(st)}”. This cannot be undone.`, [
                        { text: 'No', style: 'cancel' },
                        { text: 'Yes', onPress: () => changeStatus.mutate(st) },
                      ]);
                    }}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          {canOrder ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Fulfilment</Text>
              <Button
                title="Create Order"
                loading={createOrder.isPending}
                onPress={() => {
                  setError(null);
                  Alert.alert('Create the order?', `An order for dispatch will be created from bill ${d.billNo}.`, [
                    { text: 'No', style: 'cancel' },
                    { text: 'Yes', onPress: () => createOrder.mutate() },
                  ]);
                }}
              />
            </Card>
          ) : null}

          <ItemsCard items={d.items} />
          <TotalsCard subtotal={d.subtotal} taxTotal={d.taxTotal} grandTotal={d.grandTotal} />
          <PaymentSection customerId={d.customer.id} docType="BILL" docId={id} link={{ billId: id }} />
          <Text style={[text.muted, styles.foot]}>Orders and dispatches are under More → Orders &amp; Dispatch.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  status: { fontSize: 13, fontWeight: '700' },
  customer: { marginTop: 2, marginBottom: space.sm },
  section: { marginBottom: space.sm },
  btn: { marginTop: space.sm },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  foot: { textAlign: 'center', marginBottom: space.lg },
});
