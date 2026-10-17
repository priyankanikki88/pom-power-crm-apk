import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApprovalCard } from '../components/ApprovalCard';
import { AmcCard, ItemsCard, PdfButton, STATUS_TONE, TotalsCard } from '../components/docParts';
import { PaymentSection } from '../components/PaymentSection';
import { ReasonAction } from '../components/ReasonAction';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import { canFor } from '../lib/sales';
import type { QuotationsStackParams } from '../navigation';
import { colors, space } from '../theme';
import type { BillDetail, SalesDoc, SalesDocDetail } from '../types';

/** Same status moves as the web CRM's proforma invoice and Format-4 pages. */
const PI_TRANSITIONS: Record<string, string[]> = { DRAFT: ['CANCELLED'], APPROVAL_PENDING: ['CANCELLED'], APPROVED: ['SENT', 'CANCELLED'], SENT: ['FINAL', 'CANCELLED'] };
const F4_TRANSITIONS: Record<string, string[]> = { DRAFT: ['SENT', 'CANCELLED'], SENT: ['CANCELLED'] };
const PI_CONVERTIBLE = ['APPROVED', 'SENT', 'FINAL'];
const SOURCE: Record<string, string> = { QUOTATION: 'From quotation', PROFORMA: 'From proforma invoice', DIRECT: 'Direct', DIRECT_PAID: 'Direct (paid)' };
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/**
 * A Proforma Invoice or a Format-4 (product sales or AMC). Proforma: submit a draft for approval, approve / reject, status
 * moves, payments, convert to Format-4 once approved (one live Format-4 only). Format-4: approve / reject, status moves,
 * payments, a revision, and — once approved — raise its bill.
 */
export function DocDetailScreen({ route, navigation }: NativeStackScreenProps<QuotationsStackParams, 'DocDetail'>) {
  const { kind, id } = route.params;
  const proforma = kind === 'PROFORMA';
  const base = proforma ? '/proforma-invoices' : '/format4';
  const label = proforma ? 'Proforma' : 'Format-4';
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['sales-doc', kind, id], queryFn: () => api.get<SalesDocDetail>(`${base}/${id}`) });
  const d = q.data;
  const [error, setError] = useState<string | null>(null);
  const [editingInvoiceNo, setEditingInvoiceNo] = useState(false);
  const [invoiceNoDraft, setInvoiceNoDraft] = useState('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['sales-doc', kind, id] });
    void qc.invalidateQueries({ queryKey: ['sales-docs'] });
    void qc.invalidateQueries({ queryKey: ['quotation'] });
  };
  const submit = useMutation({
    mutationFn: () => api.post(`${base}/${id}/submit`),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ['approval', base, id] });
    },
    onError: (err) => setError(errorText(err, 'Could not submit for approval.')),
  });
  const changeStatus = useMutation({ mutationFn: (status: string) => api.patch(`${base}/${id}/status`, { status }), onSuccess: refresh, onError: (err) => setError(errorText(err, 'Could not change the status.')) });
  const convert = useMutation({
    mutationFn: () => api.post<SalesDoc>('/format4/from-proforma-invoice', { proformaInvoiceId: id }),
    onSuccess: (f4) => {
      refresh();
      navigation.push('DocDetail', { kind: 'FORMAT4', id: f4.id, no: f4.format4No ?? '' });
    },
    onError: (err) => setError(errorText(err, 'Could not convert to Format-4.')),
  });
  const createBill = useMutation({
    mutationFn: () => api.post<BillDetail>('/bills', { format4DocumentId: id }),
    onSuccess: (bill) => {
      refresh();
      void qc.invalidateQueries({ queryKey: ['bills'] });
      navigation.push('BillDetail', { id: bill.id, no: bill.billNo });
    },
    onError: (err) => setError(errorText(err, 'Could not raise the bill.')),
  });

  // A Format-4 is never changed in place: a revision is a new Format-4 (… Rev-01) that goes for approval again.
  const revise = useMutation({
    mutationFn: (reason: string) => api.post<SalesDoc>(`/format4/${id}/revisions`, { reason }),
    onSuccess: (rev) => {
      refresh();
      navigation.push('DocDetail', { kind: 'FORMAT4', id: rev.id, no: rev.format4No ?? '' });
    },
    onError: (err) => setError(errorText(err, 'Could not make a revision.')),
  });

  // Reference only: the actual tax invoice number, when raised outside this CRM (e.g. in Tally) instead of through Raise Bill.
  const setInvoiceNo = useMutation({
    mutationFn: (externalInvoiceNo: string) => api.patch<SalesDoc>(`/format4/${id}/invoice-number`, { externalInvoiceNo: externalInvoiceNo || null }),
    onSuccess: () => {
      refresh();
      setEditingInvoiceNo(false);
    },
    onError: (err) => setError(errorText(err, 'Could not save the invoice number.')),
  });

  function confirm(title: string, message: string, run: () => void) {
    setError(null);
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', onPress: run },
    ]);
  }

  const no = d ? ((proforma ? d.proformaNo : d.format4No) ?? '') : '';
  const canManage = canFor(hasPermission, d?.salesType, proforma ? 'proforma.manage' : 'format4.manage');
  const moves = d && canManage ? ((proforma ? PI_TRANSITIONS : F4_TRANSITIONS)[d.status] ?? []) : [];
  const actionLabel = (st: string) => (st === 'SENT' ? 'Mark as Sent' : st === 'FINAL' ? 'Mark as Final' : st === 'CANCELLED' ? `Cancel ${label}` : enumLabel(st));
  const liveF4 = d?.format4Documents?.filter((f) => f.status !== 'CANCELLED' && f.status !== 'REJECTED') ?? [];
  const canConvert = proforma && d && PI_CONVERTIBLE.includes(d.status) && liveF4.length === 0 && canFor(hasPermission, d.salesType, 'format4.manage');
  const canSubmit = proforma && d?.status === 'DRAFT' && canManage;
  const canEdit = proforma && d?.status === 'DRAFT' && canManage;
  // Format-4 -> Bill only once it has been approved, and only one bill (the server enforces both).
  const bills = d?.bills ?? [];
  const canBill = !proforma && d?.approvalStatus === 'APPROVED' && bills.length === 0 && hasPermission('bill.manage');
  const busy = submit.isPending || changeStatus.isPending || convert.isPending || createBill.isPending;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this document.')} /> : null}
      {route.params.notice ? <ErrorBox message={route.params.notice} /> : null}
      {d ? (
        <>
          <Card>
            <View style={styles.head}>
              <Text style={[text.h1, styles.flex]}>{no}</Text>
              <Text style={[styles.status, { color: STATUS_TONE[d.status] ?? colors.muted }]}>{enumLabel(d.status)}</Text>
            </View>
            <Text style={[text.h2, styles.customer]}>{d.customer.name}</Text>
            <Row label="Type" value={`${d.salesType === 'AMC' ? 'AMC ' : ''}${proforma ? 'Proforma Invoice' : 'Format-4'}`} />
            <Row label="Project order" value={d.isProject ? (d.projectName ?? 'Yes') : null} />
            <Row label="Date" value={formatDate(d.issueDate ?? d.createdAt)} />
            <Row label="Valid until" value={formatDate(d.validUntil)} />
            <Row label="Source" value={d.sourceType ? (SOURCE[d.sourceType] ?? enumLabel(d.sourceType)) : null} />
            <Row label="Quotation" value={d.quotation?.quotationNo} />
            <Row label="Proforma" value={!proforma ? d.proformaInvoice?.proformaNo : null} />
            <Row label="Revision" value={!proforma && d.version > 1 ? `Revision ${d.version - 1}${d.revisionReason ? ` — ${d.revisionReason}` : ''}` : null} />
            {!proforma && !editingInvoiceNo ? <Row label="Invoice No." value={d.externalInvoiceNo ?? 'Not recorded'} /> : null}
            <PdfButton path={`${base}/${id}/pdf`} fileName={no} title={`${label} ${no}`} />
            {canEdit ? (
              <View style={styles.btn}>
                <Button title="Edit Proforma Invoice" variant="secondary" onPress={() => navigation.navigate('QuotationForm', { mode: 'PROFORMA', editId: id })} />
              </View>
            ) : null}
            {!proforma && canManage ? (
              editingInvoiceNo ? (
                <View style={styles.btn}>
                  <Field label="Invoice No. (e.g. the Tally invoice number)" value={invoiceNoDraft} onChangeText={setInvoiceNoDraft} maxLength={80} />
                  <View style={styles.inlineRow}>
                    <Button title="Save" onPress={() => setInvoiceNo.mutate(invoiceNoDraft.trim())} loading={setInvoiceNo.isPending} />
                    <Button title="Cancel" variant="secondary" onPress={() => setEditingInvoiceNo(false)} />
                  </View>
                </View>
              ) : (
                <View style={styles.btn}>
                  <Button
                    title={d.externalInvoiceNo ? 'Edit Invoice No.' : 'Add Invoice No.'}
                    variant="secondary"
                    onPress={() => {
                      setInvoiceNoDraft(d.externalInvoiceNo ?? '');
                      setEditingInvoiceNo(true);
                    }}
                  />
                </View>
              )
            ) : null}
          </Card>

          {error ? <ErrorBox message={error} /> : null}

          <ApprovalCard base={base} id={id} docLabel={proforma ? 'proforma invoice' : 'Format-4'} onDecided={refresh} />

          {canSubmit || canConvert || canBill || moves.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Next step</Text>
              {canSubmit ? (
                <>
                  <Text style={[text.muted, styles.note]}>This proforma is a draft. Submit it for approval — it can be sent to the customer once an approver has approved it.</Text>
                  <Button title="Submit for Approval" loading={submit.isPending} disabled={busy} onPress={() => confirm('Submit for approval?', `Proforma ${no} will go to the approver.`, () => submit.mutate())} />
                </>
              ) : null}
              {canConvert ? (
                <View style={styles.btn}>
                  <Button title="Convert to Format-4" loading={convert.isPending} disabled={busy} onPress={() => confirm('Convert to Format-4?', 'A Format-4 will be created from this proforma invoice.', () => convert.mutate())} />
                </View>
              ) : null}
              {canBill ? (
                <View style={styles.btn}>
                  <Button title="Raise Bill" loading={createBill.isPending} disabled={busy} onPress={() => confirm('Raise the bill?', `A draft bill will be created from Format-4 ${no}.`, () => createBill.mutate())} />
                </View>
              ) : null}
              {moves.map((st) => (
                <View key={st} style={styles.btn}>
                  <Button
                    title={actionLabel(st)}
                    variant="secondary"
                    loading={changeStatus.isPending && changeStatus.variables === st}
                    disabled={busy}
                    onPress={() => confirm(actionLabel(st), `${label} ${no} will become “${enumLabel(st)}”.${st === 'CANCELLED' ? ' This cannot be undone.' : ''}`, () => changeStatus.mutate(st))}
                  />
                </View>
              ))}
            </Card>
          ) : null}

          {!proforma && canManage ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Revision</Text>
              <Text style={[text.muted, styles.note]}>A Format-4 is not changed once made. A revision is a new Format-4 with the same items that goes for approval again; a Format-4 can be revised once — after that, revise the newest one.</Text>
              <ReasonAction title="Revise Format-4" label="Reason for the revision" confirmTitle="Create Revision" busy={revise.isPending} disabled={busy} onSubmit={(reason) => revise.mutate(reason)} />
            </Card>
          ) : null}

          {(proforma && d.format4Documents && d.format4Documents.length > 0) || bills.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Generated documents</Text>
              {proforma
                ? d.format4Documents?.map((f) => (
                    <Pressable key={f.id} style={styles.link} onPress={() => navigation.push('DocDetail', { kind: 'FORMAT4', id: f.id, no: f.format4No })} accessibilityRole="button">
                      <Text style={styles.linkText}>Format-4 {f.format4No}</Text>
                      <Text style={{ color: STATUS_TONE[f.status] ?? colors.muted }}>{enumLabel(f.status)}</Text>
                    </Pressable>
                  ))
                : null}
              {bills.map((b) =>
                hasPermission('bill.read') ? (
                  <Pressable key={b.id} style={styles.link} onPress={() => navigation.push('BillDetail', { id: b.id, no: b.billNo })} accessibilityRole="button">
                    <Text style={styles.linkText}>Bill {b.billNo}</Text>
                    <Text style={{ color: STATUS_TONE[b.status] ?? colors.muted }}>{enumLabel(b.status)}</Text>
                  </Pressable>
                ) : (
                  <View key={b.id} style={styles.link}>
                    <Text style={text.body}>Bill {b.billNo}</Text>
                    <Text style={{ color: STATUS_TONE[b.status] ?? colors.muted }}>{enumLabel(b.status)}</Text>
                  </View>
                ),
              )}
            </Card>
          ) : null}

          <AmcCard doc={d} />
          <ItemsCard items={d.items} title={d.salesType === 'AMC' ? 'Equipment covered' : 'Items'} />
          <TotalsCard subtotal={d.subtotal} taxTotal={d.taxTotal} grandTotal={d.grandTotal} />

          {proforma ? <PaymentSection customerId={d.customer.id} docType="PROFORMA_INVOICE" docId={id} link={{ proformaInvoiceId: id }} /> : <PaymentSection customerId={d.customer.id} docType="FORMAT4" docId={id} link={{ format4DocumentId: id }} />}
          {!proforma ? <Text style={[text.muted, styles.foot]}>Orders and dispatch are under More → Orders &amp; Dispatch.</Text> : null}
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
  note: { marginBottom: space.md },
  btn: { marginTop: space.sm },
  inlineRow: { flexDirection: 'row', gap: space.sm },
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  linkText: { fontSize: 14.5, fontWeight: '700', color: colors.primary },
  foot: { textAlign: 'center', marginBottom: space.lg },
});
