import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { CustomerPicker, type PickedCustomer } from '../components/CustomerPicker';
import { ChipSelect, Segmented } from '../components/inputs';
import { Button, Card, Empty, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const TYPES = [
  { value: 'SALES_LEAD', label: 'Sales enquiry' },
  { value: 'SERVICE_COMPLAINT', label: 'Service complaint' },
] as const;
const TYPE_LABEL: Record<string, string> = { SALES_LEAD: 'Sales enquiry', SERVICE_COMPLAINT: 'Service complaint' };
const STATUS_TABS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'ALL', label: 'All' },
] as const;

export interface CallLog {
  id: string;
  phone: string;
  name: string | null;
  company: string | null;
  note: string | null;
  type: 'SALES_LEAD' | 'SERVICE_COMPLAINT';
  status: 'PENDING' | 'CONVERTED';
  createdAt: string;
  createdByName: string;
  convertedLead: { id: string; stage: string } | null;
  convertedTicket: { id: string; status: string; ticketNo: string } | null;
}

export const useCallLogs = (status?: 'PENDING' | 'CONVERTED') => useQuery({ queryKey: ['call-logs', 'list', status ?? 'all'], queryFn: () => api.get<CallLog[]>('/call-logs', status ? { status } : undefined) });
export const usePendingCallLogCount = () => useQuery({ queryKey: ['call-logs', 'pending-count'], queryFn: () => api.get<number>('/call-logs/pending-count'), refetchInterval: 60_000 });

function statusLine(log: CallLog): { text: string; tone: string } {
  if (log.status === 'PENDING') return { text: 'Pending', tone: colors.warning };
  if (log.convertedLead) return { text: `Lead · ${log.convertedLead.stage}`, tone: colors.primaryDark };
  if (log.convertedTicket) return { text: `${log.convertedTicket.ticketNo} · ${enumLabel(log.convertedTicket.status)}`, tone: colors.success };
  return { text: 'Converted', tone: colors.success };
}

/**
 * The call queue: every call logged by you — or, with commercial.all_owners, everyone's — waiting to become a real
 * Lead or Service Ticket. Converting is Back Office's job; this phone app's job is making logging the call itself
 * as fast as possible (just a phone number) and letting anyone check what happened to the calls they logged.
 */
export function CallLogsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'CallLogs'>) {
  const { hasPermission } = useAuth();
  const canConvert = hasPermission('commercial.all_owners');
  const [tab, setTab] = useState<'PENDING' | 'CONVERTED' | 'ALL'>('PENDING');
  const list = useCallLogs(tab === 'ALL' ? undefined : tab);
  const qc = useQueryClient();
  const rows = list.data ?? [];

  const convertToLead = useMutation({
    mutationFn: (log: CallLog) => api.post<CallLog>(`/call-logs/${log.id}/convert-to-lead`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['call-logs'] }),
  });

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.body}
      data={rows}
      keyExtractor={(l) => l.id}
      refreshControl={<RefreshControl refreshing={list.isFetching} onRefresh={() => void list.refetch()} />}
      ListHeaderComponent={
        <View style={styles.head}>
          <Button title="+ Log a Call" onPress={() => navigation.navigate('CallLogForm')} />
          <Segmented value={tab} options={STATUS_TABS as unknown as Array<{ value: typeof tab; label: string }>} onChange={setTab} />
          {list.isError ? <ErrorBox message={errorText(list.error, 'Could not load the call log')} /> : null}
          {convertToLead.error ? <ErrorBox message={errorText(convertToLead.error, 'Could not create the lead')} /> : null}
        </View>
      }
      ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title="Nothing here" />}
      renderItem={({ item }) => {
        const s = statusLine(item);
        return (
          <View style={styles.item}>
            <View style={styles.itemHead}>
              <Text style={styles.name}>{item.name || item.phone}</Text>
              <Text style={[styles.tag, { color: s.tone }]}>{s.text}</Text>
            </View>
            <Pressable onPress={() => Linking.openURL(`tel:${item.phone}`)} accessibilityRole="button">
              <Text style={styles.phone}>{item.phone}</Text>
            </Pressable>
            <Text style={styles.meta}>
              {item.company ? `${item.company} · ` : ''}
              {TYPE_LABEL[item.type]}
            </Text>
            {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
            <Text style={styles.meta}>
              {formatWhen(item.createdAt)} · logged by {item.createdByName}
            </Text>
            {canConvert && item.status === 'PENDING' ? (
              <View style={styles.rowAction}>
                {item.type === 'SALES_LEAD' ? (
                  <Button title="Convert to Lead" variant="secondary" loading={convertToLead.isPending && convertToLead.variables?.id === item.id} disabled={convertToLead.isPending} onPress={() => convertToLead.mutate(item)} />
                ) : (
                  <Button title="Convert to Service Ticket" variant="secondary" onPress={() => navigation.navigate('CallLogConvertTicket', { id: item.id })} />
                )}
              </View>
            ) : null}
          </View>
        );
      }}
    />
  );
}

/** Log a call in seconds, while the caller is still on the line. Phone is the only required field. */
export function CallLogFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'CallLogForm'>) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ phone: '', name: '', company: '', note: '' });
  const [type, setType] = useState<'SALES_LEAD' | 'SERVICE_COMPLAINT'>('SALES_LEAD');
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      api.post<CallLog>('/call-logs', {
        phone: form.phone.trim(),
        name: form.name.trim() || undefined,
        company: form.company.trim() || undefined,
        note: form.note.trim() || undefined,
        type,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['call-logs'] });
      navigation.replace('CallLogs');
    },
    onError: (err) => setError(errorText(err, 'Could not save the call log.')),
  });

  function submit() {
    if (form.phone.trim().length < 5) return setError('Enter a valid phone number.');
    setError(null);
    create.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Phone number *" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoFocus maxLength={40} />
        <Field label="Name (optional)" value={form.name} onChangeText={set('name')} maxLength={200} />
        <Field label="Company (optional)" value={form.company} onChangeText={set('company')} maxLength={200} />
        <Field label="Note (optional)" value={form.note} onChangeText={set('note')} placeholder="What did the caller say?" multiline maxLength={1000} />
        <ChipSelect label="This call is a" value={type} options={TYPES as unknown as Array<{ value: typeof type; label: string }>} onChange={(v) => v && setType(v)} />
        <Button title="Save" onPress={submit} loading={create.isPending} />
      </Card>
    </ScrollView>
  );
}

/** The one conversion that needs more than a tap: a Service Ticket needs a customer and a complaint description. */
export function CallLogConvertTicketScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'CallLogConvertTicket'>) {
  const { id } = route.params;
  const qc = useQueryClient();
  const list = useCallLogs();
  const log = list.data?.find((l) => l.id === id);
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [customerName, setCustomerName] = useState(log?.company ?? log?.name ?? '');
  const [issueDescription, setIssueDescription] = useState(log?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const convert = useMutation({
    mutationFn: () => api.post<CallLog>(`/call-logs/${id}/convert-to-ticket`, { customerId: customer?.id, customerName: customer ? undefined : customerName.trim() || undefined, issueDescription: issueDescription.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['call-logs'] });
      navigation.navigate('CallLogs');
    },
    onError: (err) => setError(errorText(err, 'Could not create the ticket.')),
  });

  function submit() {
    if (issueDescription.trim().length < 5) return setError('Describe the complaint.');
    setError(null);
    convert.mutate();
  }

  if (!log) return <ActivityIndicator style={styles.loading} color={colors.primary} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={text.h2}>{log.name || log.phone}</Text>
        {log.company ? <Text style={text.muted}>{log.company}</Text> : null}
        {error ? <ErrorBox message={error} /> : null}
        <CustomerPicker required={false} value={customer} onChange={setCustomer} />
        {!customer ? <Field label="Or create a new customer named" value={customerName} onChangeText={setCustomerName} placeholder={log.phone} /> : null}
        <Field label="Complaint *" value={issueDescription} onChangeText={setIssueDescription} multiline maxLength={4000} />
        <Button title="Create Ticket" onPress={submit} loading={convert.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.xl },
  head: { gap: space.md, marginBottom: space.md },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  tag: { fontSize: 12, fontWeight: '700' },
  phone: { fontSize: 14, color: colors.primary, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  note: { fontSize: 13, color: colors.text, marginTop: space.xs },
  rowAction: { marginTop: space.sm },
});
