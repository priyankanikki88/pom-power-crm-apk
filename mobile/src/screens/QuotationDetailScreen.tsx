import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AmcCard, ItemsCard, PdfButton, STATUS_TONE, TotalsCard } from '../components/docParts';
import { ChipSelect } from '../components/inputs';
import { PaymentSection } from '../components/PaymentSection';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import { canFor } from '../lib/sales';
import type { QuotationsStackParams } from '../navigation';
import { colors, space } from '../theme';
import type { PaymentStatus, QuotationDetail, SalesDoc } from '../types';

/** Same status moves as the web CRM's quotation page. */
const TRANSITIONS: Record<string, string[]> = { DRAFT: ['SENT', 'CANCELLED'], SENT: ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] };
const ACTION_LABEL: Record<string, string> = { SENT: 'Mark as Sent', APPROVED: 'Customer Approved', REJECTED: 'Mark Lost (Customer Rejected)', CANCELLED: 'Cancel Quotation', EXPIRED: 'Mark Expired' };
/** The same reasons the web CRM offers when a quotation is marked lost. */
const LOST_REASONS = ['Price too high', 'Competitor selected', 'Project cancelled', 'Customer postponed', 'Product unavailable', 'Payment terms', 'Other'].map((r) => ({ value: r, label: r }));
const isLive = (status: string) => status !== 'CANCELLED' && status !== 'REJECTED';
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/**
 * One quotation (product sales or AMC): header, items, totals and PDF; editing while it is a draft, or a revision — a new
 * draft copy — once it has been sent; status moves; and, once the customer has approved it, payment status, recording a
 * payment, and converting it to a Proforma Invoice or a Format-4 (the same rules as the web CRM: Proforma only while
 * unpaid, and only one live conversion).
 */
export function QuotationDetailScreen({ route, navigation }: NativeStackScreenProps<QuotationsStackParams, 'QuotationDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['quotation', id], queryFn: () => api.get<QuotationDetail>(`/quotations/${id}`) });
  const d = q.data;
  const approved = d?.status === 'APPROVED';
  const payment = useQuery({ queryKey: ['quotation-payment-status', id], queryFn: () => api.get<PaymentStatus>(`/quotations/${id}/payment-status`), enabled: approved });
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['quotation', id] });
    void qc.invalidateQueries({ queryKey: ['quotations'] });
    void qc.invalidateQueries({ queryKey: ['sales-docs'] });
  };
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState<string | null>(null);
  const [lostRemarks, setLostRemarks] = useState('');
  const changeStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/quotations/${id}/status`, { status }),
    onSuccess: refresh,
    onError: (err) => setError(errorText(err, 'Could not change the status.')),
  });
  // Marking lost goes through the same record action as the web, so the reason is kept on the quotation for reports.
  const markLost = useMutation({
    mutationFn: () => api.post(`/record-actions/quotation/${id}/mark_lost`, { reason: lostReason, remarks: lostRemarks.trim() || undefined }),
    onSuccess: () => {
      setLosing(false);
      refresh();
    },
    onError: (err) => setError(errorText(err, 'Could not mark the quotation lost.')),
  });
  const convert = useMutation({
    mutationFn: (kind: 'PROFORMA' | 'FORMAT4') => (kind === 'PROFORMA' ? api.post<SalesDoc>('/proforma-invoices', { quotationId: id }) : api.post<SalesDoc>('/format4/from-quotation', { quotationId: id })).then((doc) => ({ kind, doc })),
    onSuccess: ({ kind, doc }) => {
      refresh();
      navigation.navigate('DocDetail', { kind, id: doc.id, no: (kind === 'PROFORMA' ? doc.proformaNo : doc.format4No) ?? '' });
    },
    onError: (err) => setError(errorText(err, 'Could not convert the quotation.')),
  });

  const revise = useMutation({
    mutationFn: () => api.post<QuotationDetail>(`/quotations/${id}/revisions`),
    onSuccess: (rev) => {
      refresh();
      navigation.push('QuotationDetail', { id: rev.id, no: rev.quotationNo });
    },
    onError: (err) => setError(errorText(err, 'Could not make a revision.')),
  });

  function confirm(title: string, message: string, run: () => void) {
    setError(null);
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', onPress: run },
    ]);
  }

  const canManage = canFor(hasPermission, d?.salesType, 'quotation.manage');
  const canEditLines = canManage && hasPermission('product.read');
  const moves = d && canManage ? (TRANSITIONS[d.status] ?? []) : [];
  const liveProformas = d?.proformaInvoices.filter((p) => isLive(p.status)) ?? [];
  const liveFormat4s = d?.format4Documents.filter((f) => isLive(f.status)) ?? [];
  const unconverted = liveProformas.length === 0 && liveFormat4s.length === 0;
  const canProforma = approved && unconverted && payment.data && !payment.data.isPaid && canFor(hasPermission, d?.salesType, 'proforma.manage');
  const canFormat4 = approved && unconverted && Boolean(payment.data) && canFor(hasPermission, d?.salesType, 'format4.manage');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this quotation.')} /> : null}
      {d ? (
        <>
          <Card>
            <View style={styles.head}>
              <Text style={[text.h1, styles.flex]}>{d.quotationNo}</Text>
              <Text style={[styles.status, { color: STATUS_TONE[d.status] ?? colors.muted }]}>{enumLabel(d.status)}</Text>
            </View>
            <Text style={[text.h2, styles.customer]}>{d.customer.name}</Text>
            <Row label="Date" value={formatDate(d.quotationDate)} />
            <Row label="Valid until" value={formatDate(d.validUntil)} />
            <Row label="Subject" value={d.subject} />
            <Row label="Type" value={d.salesType === 'AMC' ? 'AMC (Annual Maintenance Contract)' : d.isProject ? `Project order${d.projectName ? ` — ${d.projectName}` : ''}` : null} />
            <Row label="Version" value={d.version > 1 ? `Revision ${d.version}` : null} />
            <PdfButton path={`/quotations/${id}/pdf`} fileName={d.quotationNo} title={`Quotation ${d.quotationNo}`} />
          </Card>

          {error ? <ErrorBox message={error} /> : null}

          {canManage && (d.status === 'DRAFT' ? canEditLines : true) ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Changes</Text>
              {d.status === 'DRAFT' ? (
                <>
                  <Text style={[text.muted, styles.note]}>This quotation is a draft — its products, quantities, discount and details can still be changed.</Text>
                  <Button title="Edit Quotation" variant="secondary" onPress={() => navigation.navigate('QuotationForm', { editId: id })} />
                </>
              ) : (
                <>
                  <Text style={[text.muted, styles.note]}>A quotation that has left draft is not changed. A revision is a new draft copy of it, with its own number, that you can edit and send.</Text>
                  <Button title="Revise (New Draft Copy)" variant="secondary" loading={revise.isPending} disabled={revise.isPending} onPress={() => confirm('Make a revision?', `A new draft quotation will be created as a copy of ${d.quotationNo}. ${d.quotationNo} itself stays as it is.`, () => revise.mutate())} />
                </>
              )}
            </Card>
          ) : null}

          {moves.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Next step</Text>
              {moves.map((st) =>
                st === 'REJECTED' ? (
                  <View key={st} style={styles.btn}>
                    {losing ? (
                      <>
                        <ChipSelect label="Why was it lost? *" value={lostReason} options={LOST_REASONS} onChange={setLostReason} />
                        <Field label={lostReason === 'Other' ? 'Remarks *' : 'Remarks'} value={lostRemarks} onChangeText={setLostRemarks} multiline maxLength={1000} />
                        <Button title="Confirm — Mark Lost" variant="danger" loading={markLost.isPending} disabled={!lostReason || (lostReason === 'Other' && lostRemarks.trim().length < 3) || changeStatus.isPending} onPress={() => markLost.mutate()} />
                        <View style={styles.btn} />
                        <Button title="Back" variant="secondary" onPress={() => setLosing(false)} />
                      </>
                    ) : (
                      <Button title={ACTION_LABEL.REJECTED!} variant="secondary" disabled={changeStatus.isPending} onPress={() => setLosing(true)} />
                    )}
                  </View>
                ) : (
                <View key={st} style={styles.btn}>
                  <Button
                    title={ACTION_LABEL[st] ?? enumLabel(st)}
                    variant={st === 'SENT' || st === 'APPROVED' ? 'primary' : 'secondary'}
                    loading={changeStatus.isPending && changeStatus.variables === st}
                    disabled={changeStatus.isPending}
                    onPress={() => confirm(ACTION_LABEL[st] ?? enumLabel(st), `Quotation ${d.quotationNo} will become “${enumLabel(st)}”.`, () => changeStatus.mutate(st))}
                  />
                </View>
                ),
              )}
            </Card>
          ) : null}

          {approved ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Payment status</Text>
              {payment.data ? (
                <>
                  <Row label="Received" value={formatINR(payment.data.amountPaid)} />
                  <Row label="Balance" value={formatINR(payment.data.amountDue)} />
                  <Row label="Route" value={payment.data.isPaid ? 'Paid — straight to Format-4' : 'Not paid — Proforma first, or Format-4'} />
                </>
              ) : (
                <Text style={text.muted}>{payment.isError ? 'Your role cannot see the payment status.' : 'Loading…'}</Text>
              )}
              {canProforma ? (
                <View style={styles.btn}>
                  <Button title="Convert to Proforma Invoice" loading={convert.isPending && convert.variables === 'PROFORMA'} disabled={convert.isPending} onPress={() => confirm('Convert to Proforma Invoice?', 'A draft proforma invoice will be created from this quotation.', () => convert.mutate('PROFORMA'))} />
                </View>
              ) : null}
              {canFormat4 ? (
                <View style={styles.btn}>
                  <Button title="Convert to Format-4" variant={canProforma ? 'secondary' : 'primary'} loading={convert.isPending && convert.variables === 'FORMAT4'} disabled={convert.isPending} onPress={() => confirm('Convert to Format-4?', 'A Format-4 will be created from this quotation.', () => convert.mutate('FORMAT4'))} />
                </View>
              ) : null}
            </Card>
          ) : null}

          {d.proformaInvoices.length > 0 || d.format4Documents.length > 0 ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Generated documents</Text>
              {d.proformaInvoices.map((p) => (
                <Pressable key={p.id} style={styles.link} onPress={() => navigation.navigate('DocDetail', { kind: 'PROFORMA', id: p.id, no: p.proformaNo })} accessibilityRole="button">
                  <Text style={styles.linkText}>Proforma {p.proformaNo}</Text>
                  <Text style={{ color: STATUS_TONE[p.status] ?? colors.muted }}>{enumLabel(p.status)}</Text>
                </Pressable>
              ))}
              {d.format4Documents.map((f) => (
                <Pressable key={f.id} style={styles.link} onPress={() => navigation.navigate('DocDetail', { kind: 'FORMAT4', id: f.id, no: f.format4No })} accessibilityRole="button">
                  <Text style={styles.linkText}>Format-4 {f.format4No}</Text>
                  <Text style={{ color: STATUS_TONE[f.status] ?? colors.muted }}>{enumLabel(f.status)}</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          <AmcCard doc={d} />
          <ItemsCard items={d.items} title={d.salesType === 'AMC' ? 'Equipment covered' : 'Items'} />
          <TotalsCard subtotal={d.subtotal} discountTotal={d.discountTotal} taxTotal={d.taxTotal} grandTotal={d.grandTotal} />

          {approved ? <PaymentSection customerId={d.customer.id} docType="QUOTATION" docId={id} link={{ quotationId: id }} /> : null}

          {d.notes ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Notes</Text>
              <Text style={text.body}>{d.notes}</Text>
            </Card>
          ) : null}
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
  link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  linkText: { fontSize: 14.5, fontWeight: '700', color: colors.primary },
});
