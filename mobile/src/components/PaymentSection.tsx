import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { formatDate, isoDay } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import { colors, space } from '../theme';
import type { Payment } from '../types';
import { ChipSelect, DateField } from './inputs';
import { Button, Card, ErrorBox, Field, text } from './ui';

const MODES = [
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
];

export interface PaymentDraft {
  amount: string;
  mode: string;
  referenceNo: string;
  /** The day the money was received — today, or an earlier day for a payment entered late. */
  date: Date;
}
export const newPaymentDraft = (): PaymentDraft => ({ amount: '', mode: 'UPI', referenceNo: '', date: new Date() });

/** The amount typed, to two decimals; null when it is not an amount above zero. */
export function paymentAmount(d: PaymentDraft): number | null {
  const value = Number(d.amount.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** What POST /payments takes for this draft, apart from the customer and the document it is against. */
export const paymentBody = (d: PaymentDraft, amount: number) => ({ amount, paymentMode: d.mode, referenceNo: d.referenceNo.trim() || undefined, paymentDate: isoDay(d.date) });

/** Amount, mode, reference and the date received (never a future date). */
export function PaymentFields({ value, onChange, amountLabel = 'Amount received (₹) *' }: { value: PaymentDraft; onChange: (d: PaymentDraft) => void; amountLabel?: string }) {
  return (
    <>
      <Field label={amountLabel} value={value.amount} onChangeText={(amount) => onChange({ ...value, amount })} keyboardType="decimal-pad" />
      <ChipSelect label="Mode *" value={value.mode} options={MODES} onChange={(mode) => mode && onChange({ ...value, mode })} />
      <Field label="Reference / UTR / cheque no." value={value.referenceNo} onChangeText={(referenceNo) => onChange({ ...value, referenceNo })} autoCapitalize="characters" />
      <DateField label="Payment date * (today, or the earlier day it was received)" value={value.date} maximumDate={new Date()} onChange={(date) => date && onChange({ ...value, date })} />
    </>
  );
}

type DocType = 'QUOTATION' | 'PROFORMA_INVOICE' | 'FORMAT4' | 'BILL';
type DocLink = { quotationId?: string; proformaInvoiceId?: string; format4DocumentId?: string; billId?: string };

/** Payments received against one document: the list (payment.read) and a form to record one (payment.manage). */
export function PaymentSection({ customerId, docType, docId, link }: { customerId: string; docType: DocType; docId: string; link: DocLink }) {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const canRead = hasPermission('payment.read');
  const canRecord = hasPermission('payment.manage');
  const list = useQuery({ queryKey: ['payments-for-document', docType, docId], queryFn: () => api.get<Payment[]>(`/payments/by-document/${docType}/${docId}`), enabled: canRead });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft>(newPaymentDraft);
  const [error, setError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: (amount: number) => api.post('/payments', { customerId, ...link, ...paymentBody(draft, amount) }),
    onSuccess: () => {
      setOpen(false);
      setDraft(newPaymentDraft());
      void qc.invalidateQueries({ queryKey: ['payments-for-document'] });
      void qc.invalidateQueries({ queryKey: ['quotation-payment-status'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not record the payment.'),
  });

  function submit() {
    const amount = paymentAmount(draft);
    if (amount === null) return setError('Enter the amount received.');
    setError(null);
    record.mutate(amount);
  }

  if (!canRead && !canRecord) return null;
  return (
    <Card>
      <Text style={[text.h2, styles.section]}>Payments</Text>
      {list.data && list.data.length === 0 ? <Text style={text.muted}>No payment recorded yet.</Text> : null}
      {list.data?.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.flex}>
            <Text style={text.body}>
              {p.paymentNo} · {enumLabel(p.paymentMode)}
            </Text>
            <Text style={text.muted}>
              {formatDate(p.paymentDate)}
              {p.referenceNo ? ` · Ref ${p.referenceNo}` : ''}
            </Text>
          </View>
          <Text style={styles.amount}>{formatINR(p.allocatedAmount ?? p.amount)}</Text>
        </View>
      ))}
      {canRecord ? (
        open ? (
          <View style={styles.form}>
            {error ? <ErrorBox message={error} /> : null}
            <PaymentFields value={draft} onChange={setDraft} />
            <Button title="Save Payment" onPress={submit} loading={record.isPending} />
            <View style={styles.gap} />
            <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} />
          </View>
        ) : (
          <View style={styles.form}>
            <Button title="Record Payment" variant="secondary" onPress={() => setOpen(true)} />
          </View>
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: space.sm },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  amount: { fontSize: 14.5, fontWeight: '700', color: colors.success },
  form: { marginTop: space.md },
  gap: { height: space.sm },
});
