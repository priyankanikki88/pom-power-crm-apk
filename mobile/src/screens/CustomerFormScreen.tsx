import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChipSelect } from '../components/inputs';
import { Button, Card, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { CustomersStackParams } from '../navigation';
import { colors, space } from '../theme';
import type { CustomerDetail, DuplicateMatch } from '../types';

const TYPES = [
  ['END_CUSTOMER', 'End Customer'],
  ['DEALER', 'Dealer'],
  ['DISTRIBUTOR', 'Distributor'],
  ['EPC', 'EPC'],
  ['SYSTEM_INTEGRATOR', 'System Integrator'],
  ['CORPORATE', 'Corporate'],
  ['GOVERNMENT', 'Government'],
  ['OEM', 'OEM'],
].map(([value, label]) => ({ value: value!, label: label! }));

interface Form {
  type: string;
  name: string;
  phone: string;
  altPhone: string;
  email: string;
  gstin: string;
  notes: string;
  contactName: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}
const EMPTY: Form = { type: 'END_CUSTOMER', name: '', phone: '', altPhone: '', email: '', gstin: '', notes: '', contactName: '', line1: '', city: '', state: '', pincode: '' };
const opt = (v: string) => v.trim() || undefined;

/**
 * Add a customer (the essentials a sales person has in the field) or edit an existing one's main details. The server
 * runs its usual duplicate check: an exact match is refused, a similar one needs a written reason — same as the web CRM.
 */
export function CustomerFormScreen({ route, navigation }: NativeStackScreenProps<CustomersStackParams, 'CustomerForm'>) {
  const id = route.params?.id;
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/customers/${id}`), enabled: Boolean(id) });
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(!id);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ matches: DuplicateMatch[]; canConfirm: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // An exact-duplicate refusal no longer applies once the details change; the server checks again on save.
    if (duplicates && !duplicates.canConfirm) setDuplicates(null);
  };

  useEffect(() => {
    const c = existing.data;
    if (!c || loaded) return;
    setForm({ ...EMPTY, type: c.type, name: c.name, phone: c.phone ?? '', altPhone: c.altPhone ?? '', email: c.email ?? '', gstin: c.gstin ?? '', notes: c.notes ?? '' });
    setLoaded(true);
  }, [existing.data, loaded]);

  const save = useMutation({
    mutationFn: () => {
      const main = { type: form.type, name: form.name.trim(), phone: opt(form.phone), altPhone: opt(form.altPhone), email: opt(form.email), gstin: opt(form.gstin.toUpperCase()), notes: opt(form.notes) };
      if (id) return api.patch<CustomerDetail>(`/customers/${id}`, main);
      const address = form.line1.trim() ? [{ type: 'BILLING', line1: form.line1.trim(), city: form.city.trim(), state: form.state.trim(), pincode: form.pincode.trim(), isDefault: true }] : undefined;
      const contacts = form.contactName.trim() ? [{ name: form.contactName.trim(), phone: opt(form.phone), isPrimary: true }] : undefined;
      return api.post<CustomerDetail>('/customers', { ...main, addresses: address, contacts, duplicateReason: opt(reason) });
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['customer'] });
      if (id) navigation.goBack();
      else navigation.replace('CustomerDetail', { id: saved.id, name: saved.name });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && err.body && typeof err.body === 'object' && 'duplicates' in err.body) {
        const body = err.body as { duplicates: DuplicateMatch[]; canConfirm?: boolean };
        setDuplicates({ matches: body.duplicates, canConfirm: Boolean(body.canConfirm) });
      }
      setError(err instanceof ApiError ? err.message : 'Could not save the customer.');
    },
  });

  function submit() {
    if (!form.name.trim()) return setError('Enter the customer / company name.');
    if (!id && form.line1.trim() && !(form.city.trim() && form.state.trim() && form.pincode.trim())) return setError('For an address, fill city, state and pincode too.');
    if (duplicates?.canConfirm && !reason.trim()) return setError('Write why this is a different customer from the similar ones listed.');
    setError(null);
    save.mutate();
  }

  if (id && !loaded) return <View style={styles.body}>{existing.isError ? <ErrorBox message="Could not load this customer." /> : <Text style={text.muted}>Loading…</Text>}</View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        {duplicates ? (
          <View style={styles.dups}>
            <Text style={styles.dupTitle}>{duplicates.canConfirm ? 'Similar customers already exist' : 'This customer already exists'}</Text>
            {duplicates.matches.map((m) => (
              <Text key={m.customer.id} style={styles.dup}>
                • {m.customer.name} ({m.customer.customerCode}) — {m.reason}
                {m.customer.owner ? ` · ${m.customer.owner.fullName}` : ''}
              </Text>
            ))}
            {duplicates.canConfirm ? <Field label="Why is this a different customer? *" value={reason} onChangeText={setReason} multiline maxLength={500} /> : null}
          </View>
        ) : null}
        <ChipSelect label="Type *" value={form.type} options={TYPES} onChange={(v) => v && set('type')(v)} />
        <Field label="Company / customer name * (as per GST)" value={form.name} onChangeText={set('name')} />
        <Field label="Mobile" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Field label="Alternate mobile" value={form.altPhone} onChangeText={set('altPhone')} keyboardType="phone-pad" />
        <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Field label="GSTIN" value={form.gstin} onChangeText={set('gstin')} autoCapitalize="characters" autoCorrect={false} maxLength={15} />
        {!id ? (
          <>
            <Field label="Contact person" value={form.contactName} onChangeText={set('contactName')} />
            <Text style={[text.h2, styles.section]}>Billing address (optional)</Text>
            <Field label="Address" value={form.line1} onChangeText={set('line1')} />
            <Field label="City" value={form.city} onChangeText={set('city')} />
            <Field label="State" value={form.state} onChangeText={set('state')} />
            <Field label="Pincode" value={form.pincode} onChangeText={set('pincode')} keyboardType="number-pad" maxLength={6} />
          </>
        ) : null}
        <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
        <Button title={id ? 'Save Changes' : 'Add Customer'} onPress={submit} loading={save.isPending} disabled={Boolean(duplicates && !duplicates.canConfirm)} />
        {id ? <Text style={[text.muted, styles.note]}>Contacts, addresses, GST verification and commercial terms are edited on the web CRM.</Text> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  section: { marginTop: space.sm, marginBottom: space.md },
  note: { marginTop: space.md },
  dups: { backgroundColor: colors.warningSoft, borderRadius: 10, padding: space.md, marginBottom: space.md },
  dupTitle: { fontWeight: '700', color: colors.warning, marginBottom: space.xs },
  dup: { fontSize: 13, color: colors.text, marginBottom: 2 },
});
