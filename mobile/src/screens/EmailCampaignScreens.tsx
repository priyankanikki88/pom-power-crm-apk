import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChipSelect } from '../components/inputs';
import { Badge, Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

type AudienceType = 'LEADS' | 'CUSTOMERS';
type Status = 'DRAFT' | 'SENDING' | 'SENT';
const STATUS_TONE: Record<Status, string> = { DRAFT: colors.muted, SENDING: colors.warning, SENT: colors.success };
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

const STAGES = ['New Enquiry', 'Site Survey', 'Quotation Sent', 'Negotiation', 'Won', 'Lost'];
const CUSTOMER_STATUSES = ['PROSPECT', 'ACTIVE', 'INACTIVE', 'BLOCKED'];
const CUSTOMER_TYPES = ['DEALER', 'DISTRIBUTOR', 'EPC', 'SYSTEM_INTEGRATOR', 'END_CUSTOMER', 'CORPORATE', 'GOVERNMENT', 'OEM', 'PROJECT_DEVELOPER', 'OTHER'];

interface EmailCampaign {
  id: string;
  subject: string;
  bodyHtml: string;
  audienceType: AudienceType;
  status: Status;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
}
interface EmailCampaignDetail extends EmailCampaign {
  recipients: Array<{ id: string; name: string; email: string; status: 'PENDING' | 'SENT' | 'FAILED'; error: string | null }>;
}

/** Bulk email to leads or customers — composed once, sent through the SMTP settings already configured on the web CRM. */
export function EmailCampaignsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'EmailCampaigns'>) {
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('EmailCampaignForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="New email">
          <Text style={styles.headerBtn}>+ New</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const list = useQuery({ queryKey: ['email-campaigns', 'list'], queryFn: () => api.get<Paginated<EmailCampaign>>('/email-campaigns', { pageSize: 50 }) });
  const items = list.data?.items ?? [];

  return (
    <View style={styles.screen}>
      {list.isError ? (
        <View style={styles.pad}>
          <ErrorBox message={errorText(list.error, 'Could not load emails.')} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}>
        {list.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {list.data && items.length === 0 ? <Empty title="No emails yet" hint="Tap + New to compose one." /> : null}
        {items.map((c) => (
          <Pressable key={c.id} style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('EmailCampaignDetail', { id: c.id, subject: c.subject })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.subject} numberOfLines={1}>
                {c.subject}
              </Text>
              <Text style={[styles.status, { color: STATUS_TONE[c.status] }]}>{enumLabel(c.status)}</Text>
            </View>
            <Text style={text.muted}>
              {c.audienceType === 'LEADS' ? 'Leads' : 'Customers'} · {formatDate(c.createdAt)}
            </Text>
            <Text style={text.muted}>
              {c.sentCount}/{c.totalRecipients} sent{c.failedCount > 0 ? ` · ${c.failedCount} failed` : ''}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** One email campaign: subject, body preview, send progress — Send while it is still a draft. */
export function EmailCampaignDetailScreen({ route }: NativeStackScreenProps<MoreStackParams, 'EmailCampaignDetail'>) {
  const { id } = route.params;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['email-campaigns', 'one', id],
    queryFn: () => api.get<EmailCampaignDetail>(`/email-campaigns/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'SENDING' ? 2000 : false),
  });
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => api.post(`/email-campaigns/${id}/send`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['email-campaigns'] }),
    onError: (err) => setError(errorText(err, 'Could not start sending.')),
  });
  const c = q.data;

  if (q.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  if (!c)
    return (
      <View style={styles.pad}>
        <ErrorBox message={errorText(q.error, 'Could not load this email.')} />
      </View>
    );
  const failed = c.recipients.filter((r) => r.status === 'FAILED');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <View style={styles.row}>
          <Text style={[text.h1, styles.flex]} numberOfLines={2}>
            {c.subject}
          </Text>
          <Badge value={c.status} label={enumLabel(c.status)} />
        </View>
        <Row label="Audience" value={c.audienceType === 'LEADS' ? 'Leads' : 'Customers'} />
        <Row label="Recipients" value={String(c.totalRecipients)} />
        <Row label="Sent" value={String(c.sentCount)} />
        <Row label="Failed" value={c.failedCount > 0 ? String(c.failedCount) : null} />
        <Row label="Created" value={formatDate(c.createdAt)} />
        <Row label="Sent at" value={c.sentAt ? formatDate(c.sentAt) : null} />
        {c.status === 'DRAFT' ? <Button title="Send Now" onPress={() => send.mutate()} loading={send.isPending} /> : null}
        {c.status === 'SENDING' ? <Text style={[text.muted, styles.hint]}>Sending… this screen updates automatically.</Text> : null}
      </Card>

      <Card>
        <Text style={[text.h2, styles.section]}>Body</Text>
        <Text style={text.body}>{c.bodyHtml.replace(/<br\s*\/?>/g, '\n').replace(/<\/?p>/g, '')}</Text>
      </Card>

      {failed.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Failed ({failed.length})</Text>
          {failed.map((r) => (
            <View key={r.id} style={styles.recipientRow}>
              <Text style={text.body}>
                {r.name} · {r.email}
              </Text>
              {r.error ? <Text style={styles.error}>{r.error}</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}

/** Compose a bulk email: subject, body and who it goes to. */
export function EmailCampaignFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'EmailCampaignForm'>) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audienceType, setAudienceType] = useState<AudienceType>('LEADS');
  const [stage, setStage] = useState<string | null>(null);
  const [customerStatus, setCustomerStatus] = useState<string | null>(null);
  const [customerType, setCustomerType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<EmailCampaign>('/email-campaigns', {
        subject: subject.trim(),
        bodyHtml: `<p>${body.trim().replace(/\n/g, '<br>')}</p>`,
        audienceType,
        ...(audienceType === 'LEADS' ? { stage: stage ?? undefined } : { status: customerStatus ?? undefined, customerType: customerType ?? undefined }),
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['email-campaigns'] });
      navigation.replace('EmailCampaignDetail', { id: res.id, subject: res.subject });
    },
    onError: (err) => setError(errorText(err, 'Could not create the email.')),
  });

  function submit() {
    if (!subject.trim()) return setError('Enter the subject.');
    if (!body.trim()) return setError('Enter the email body.');
    setError(null);
    create.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Subject *" value={subject} onChangeText={setSubject} maxLength={300} />
        <Field label="Message *" value={body} onChangeText={setBody} multiline maxLength={10000} />
        <ChipSelect label="Send to *" value={audienceType} options={[{ value: 'LEADS', label: 'Leads' }, { value: 'CUSTOMERS', label: 'Customers' }]} onChange={(v) => v && setAudienceType(v)} />
        {audienceType === 'LEADS' ? (
          <ChipSelect label="Stage (optional)" value={stage} options={STAGES.map((v) => ({ value: v, label: v }))} onChange={setStage} allowClear />
        ) : (
          <>
            <ChipSelect label="Customer status (optional)" value={customerStatus} options={CUSTOMER_STATUSES.map((v) => ({ value: v, label: enumLabel(v) }))} onChange={setCustomerStatus} allowClear />
            <ChipSelect label="Customer type (optional)" value={customerType} options={CUSTOMER_TYPES.map((v) => ({ value: v, label: enumLabel(v) }))} onChange={setCustomerType} allowClear />
          </>
        )}
        <Text style={[text.muted, styles.hint]}>Only {audienceType === 'LEADS' ? 'leads' : 'customers'} with an email on file will be included. The list is fixed once created — review it before sending.</Text>
        <Button title="Create & Review" onPress={submit} loading={create.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  pad: { padding: space.lg },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  loading: { padding: space.xl },
  flex: { flex: 1 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  subject: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  status: { fontSize: 12, fontWeight: '700' },
  section: { marginBottom: space.sm },
  hint: { marginVertical: space.sm },
  recipientRow: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  error: { fontSize: 13, color: colors.danger, marginTop: 2 },
});
