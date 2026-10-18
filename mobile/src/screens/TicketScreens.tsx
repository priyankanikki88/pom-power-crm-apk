import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CustomerPicker, type PickedCustomer } from '../components/CustomerPicker';
import { ChipSelect } from '../components/inputs';
import { AuthImage, PhotoAdder } from '../components/photos';
import { ReasonAction } from '../components/ReasonAction';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { actionTitle, savedOnPhoneAlert } from '../lib/offlineNotice';
import { sendOrQueue, useOutbox } from '../lib/outbox';
import { formatDate } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import type { ServiceStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated, ProductVariant, TicketDetail } from '../types';
import { SERVICE_TONE } from './ServiceScreen';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const variantTitle = (v: ProductVariant) => `${v.productName ?? v.model.name}${v.rating ? ` · ${v.rating}` : ''}`;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => ({ value, label: enumLabel(value) }));
const RESOLUTION_OPTIONS = ['RESOLVED', 'PARTIALLY_RESOLVED', 'PENDING_PARTS', 'ESCALATED'].map((value) => ({ value, label: enumLabel(value) }));
const CONFIRM_OPTIONS = [
  { value: 'NONE', label: 'Skip for now' },
  { value: 'OTP', label: 'Confirm by OTP' },
];

/**
 * One service ticket (complaint). The assigned engineer works it from here: Start Work, file the service report, note
 * parts used, put it on hold / resume, book a revisit, resolve. Assigning, closing and reopening are the coordinator's
 * steps and stay on the web CRM. `canWork` comes from the server — the app never decides who may work a ticket.
 */
export function TicketDetailScreen({ route }: NativeStackScreenProps<ServiceStackParams, 'TicketDetail'>) {
  const { id } = route.params;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['service', 'ticket', id], queryFn: () => api.get<TicketDetail>(`/service-tickets/${id}`) });
  const t = q.data;
  const [error, setError] = useState<string | null>(null);
  const [arrivalTime, setArrivalTime] = useState<Date | null>(null);
  const [pickingArrival, setPickingArrival] = useState(false);
  const [faultFound, setFaultFound] = useState('');
  const [workDone, setWorkDone] = useState('');
  const [resolutionStatus, setResolutionStatus] = useState<string | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<string | null>('NONE');
  const [otpCode, setOtpCode] = useState('');
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [part, setPart] = useState<{ productVariantId?: string; partName: string; qty: string; cost: string }>({ partName: '', qty: '1', cost: '' });
  const [partInput, setPartInput] = useState('');
  const [partSearch, setPartSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setPartSearch(partInput.trim()), 350);
    return () => clearTimeout(t);
  }, [partInput]);
  const partResults = useQuery({
    queryKey: ['products', 'picker', partSearch],
    queryFn: () => api.get<Paginated<ProductVariant>>('/products', { search: partSearch, active: 'true', pageSize: 8 }),
    enabled: partSearch.length >= 2,
  });
  const [revisitDate, setRevisitDate] = useState(() => new Date(Date.now() + 24 * 3600 * 1000));
  const [pickingDate, setPickingDate] = useState(false);
  const [revisitReason, setRevisitReason] = useState('');
  const waiting = useOutbox().filter((e) => e.path.startsWith(`/service-tickets/${id}/`)).length;

  // An OTP is time-sensitive — it must actually reach the customer now, so this goes straight to the server rather
  // than through sendOrQueue's offline-friendly flow (which would silently queue it for "later", defeating the point).
  const sendOtp = useMutation({
    mutationFn: () => api.post<{ phone: string; expiresAt: string }>(`/service-tickets/${id}/report-otp`, {}),
    onSuccess: (res) => {
      setError(null);
      setOtpSentTo(res.phone);
    },
    onError: (err) => setError(errorText(err, 'Could not send the OTP.')),
  });

  const act = useMutation({
    // Field work is often done where there is no network: the entry is kept on the phone and sent, in order, later.
    mutationFn: ({ action, body }: { action: string; body?: unknown }) => sendOrQueue({ title: `Ticket ${route.params.no} — ${actionTitle(action)}`, method: 'POST', path: `/service-tickets/${id}/${action}`, body, refresh: ['service'] }),
    onSuccess: (res, vars) => {
      if (res.queued) savedOnPhoneAlert();
      void qc.invalidateQueries({ queryKey: ['service'] });
      if (vars.action === 'reports') {
        setArrivalTime(null);
        setFaultFound('');
        setWorkDone('');
        setResolutionStatus(null);
        setConfirmMethod('NONE');
        setOtpCode('');
        setOtpSentTo(null);
      }
      if (vars.action === 'parts') setPart({ partName: '', qty: '1', cost: '' });
      if (vars.action === 'revisits') setRevisitReason('');
    },
    onError: (err) => setError(errorText(err, 'Could not save.')),
  });
  const completeRevisit = useMutation({
    mutationFn: ({ revisitId, remarks }: { revisitId: string; remarks: string }) => sendOrQueue({ title: `Ticket ${route.params.no} — Revisit completed`, method: 'POST', path: `/service-revisits/${revisitId}/complete`, body: { remarks }, refresh: ['service'] }),
    onSuccess: (res) => {
      if (res.queued) savedOnPhoneAlert();
      void qc.invalidateQueries({ queryKey: ['service'] });
    },
    onError: (err) => setError(errorText(err, 'Could not complete the revisit.')),
  });
  const run = (action: string, body?: unknown) => {
    setError(null);
    act.mutate({ action, body });
  };
  const doing = (action: string) => act.isPending && act.variables?.action === action;

  function addReport() {
    if (workDone.trim().length < 5) return setError('Describe the work done (at least a few words).');
    if (confirmMethod === 'OTP' && !otpCode.trim()) return setError('Enter the OTP the customer read out — or switch to "Skip for now".');
    run('reports', {
      arrivalTime: arrivalTime ? arrivalTime.toISOString() : undefined,
      faultFound: faultFound.trim() || undefined,
      workDone: workDone.trim(),
      resolutionStatus: resolutionStatus || undefined,
      otpCode: confirmMethod === 'OTP' ? otpCode.trim() : undefined,
    });
  }
  function addPart() {
    const qty = Number(part.qty);
    const cost = part.cost.trim() ? Number(part.cost) : 0;
    if (!part.productVariantId && part.partName.trim().length < 2) return setError('Enter the part name, or pick one from the catalogue.');
    if (!(qty > 0) || !(cost >= 0)) return setError('Enter a valid quantity and cost.');
    run('parts', { productVariantId: part.productVariantId, partName: part.partName.trim() || undefined, qty, cost });
  }
  function bookRevisit() {
    if (revisitReason.trim().length < 3) return setError('Write why a revisit is needed.');
    run('revisits', { visitDate: isoDate(revisitDate), reason: revisitReason.trim() });
  }

  if (q.isLoading) return <ActivityIndicator style={{ padding: space.xl }} color={colors.primary} />;
  if (!t) return <View style={styles.body}><ErrorBox message={errorText(q.error, 'Could not load this ticket.')} /></View>;
  const working = t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS';
  const phone = t.contactPhone;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.head}>
          <Text style={[text.h1, styles.flex]}>{t.ticketNo}</Text>
          <Text style={[styles.status, { color: SERVICE_TONE[t.status] ?? colors.muted }]}>{enumLabel(t.status)}</Text>
        </View>
        <Text style={[text.h2, styles.sub]}>{t.customer.name}</Text>
        <Row label="Problem" value={t.issueDescription} />
        <Row label="Priority" value={enumLabel(t.priority)} />
        <Row label="Product" value={t.productTitle} />
        <Row label="Serial no." value={t.serialNo} />
        <Row label="Warranty" value={t.warrantyRecord ? `${enumLabel(t.warrantyRecord.effectiveStatus)} · till ${formatDate(t.warrantyRecord.warrantyEnd)}` : 'No warranty on record'} />
        <Row label="Contact" value={t.contactName} />
        <Row label="Mobile" value={phone} />
        <Row label="Engineer" value={t.assignedEngineer?.name ?? 'Not assigned'} />
        <Row label="Logged" value={formatDate(t.createdAt)} />
        {phone ? (
          <View style={styles.gap}>
            <Button title="Call Customer" variant="secondary" onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} />
          </View>
        ) : null}
      </Card>

      {error ? <ErrorBox message={error} /> : null}
      {waiting > 0 ? <Text style={{ color: colors.warning, fontSize: 13, marginBottom: space.md }}>{waiting} {waiting === 1 ? 'entry' : 'entries'} for this ticket {waiting === 1 ? 'is' : 'are'} saved on this phone, waiting for the network. The ticket below is as the server last had it.</Text> : null}

      {t.canWork && (working || t.status === 'PENDING') ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Work</Text>
          {t.status === 'ASSIGNED' ? <Button title="Start Work" loading={doing('start')} disabled={act.isPending} onPress={() => run('start')} /> : null}
          {t.status === 'IN_PROGRESS' ? (
            <>
              {t.reports.length === 0 ? <Text style={[text.muted, styles.note]}>File a service report below before resolving.</Text> : null}
              <Button title="Mark Resolved" loading={doing('resolve')} disabled={act.isPending || t.reports.length === 0} onPress={() => run('resolve')} />
            </>
          ) : null}
          {t.status === 'PENDING' ? <Button title="Resume Work" loading={doing('resume')} disabled={act.isPending} onPress={() => run('resume')} /> : null}
          {working ? (
            <View style={styles.gap}>
              <ReasonAction title="Put On Hold" label="Why is it on hold? (e.g. waiting for part)" confirmTitle="Confirm On Hold" busy={doing('pending')} disabled={act.isPending} onSubmit={(reason) => run('pending', { reason })} />
            </View>
          ) : null}
        </Card>
      ) : null}
      {!t.canWork && working ? <Text style={[text.muted, styles.foot]}>Only the assigned engineer or a service coordinator records the work on this ticket.</Text> : null}

      <Card>
        <Text style={[text.h2, styles.section]}>Service reports ({t.reports.length})</Text>
        {t.reports.map((r) => (
          <View key={r.id} style={styles.entry}>
            <Text style={text.body}>{r.workDone}</Text>
            <Text style={text.muted}>
              {formatDate(r.reportDate)} · {r.engineer.name}
              {r.signedBy ? ` · signed by ${r.signedBy}` : ''}
            </Text>
          </View>
        ))}
        {t.canWork && working ? (
          <View style={styles.gap}>
            <Text style={styles.label}>Arrival time (optional)</Text>
            <Pressable style={styles.dateBox} onPress={() => setPickingArrival(true)} accessibilityRole="button" accessibilityLabel="Arrival time">
              <Text style={[text.body, !arrivalTime && text.muted]}>{arrivalTime ? arrivalTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Not set — tap to record'}</Text>
            </Pressable>
            {pickingArrival ? (
              <DateTimePicker
                value={arrivalTime ?? new Date()}
                mode="time"
                onChange={(event, picked) => {
                  setPickingArrival(false);
                  if (event.type !== 'dismissed' && picked) setArrivalTime(picked);
                }}
              />
            ) : null}
            <Field label="Fault found (optional)" value={faultFound} onChangeText={setFaultFound} multiline maxLength={4000} />
            <Field label="Work done *" value={workDone} onChangeText={setWorkDone} multiline maxLength={8000} />
            <ChipSelect label="Resolution status (optional)" value={resolutionStatus} options={RESOLUTION_OPTIONS} onChange={setResolutionStatus} allowClear />
            <ChipSelect label="Customer confirmation" value={confirmMethod} options={CONFIRM_OPTIONS} onChange={setConfirmMethod} />
            {confirmMethod === 'OTP' ? (
              <View style={styles.gap}>
                <Button title={otpSentTo ? `Resend OTP (sent to ${otpSentTo})` : 'Send OTP to Customer'} variant="secondary" loading={sendOtp.isPending} disabled={sendOtp.isPending} onPress={() => sendOtp.mutate()} />
                {otpSentTo ? <Field label="OTP from customer *" value={otpCode} onChangeText={setOtpCode} keyboardType="number-pad" maxLength={8} /> : null}
                <Text style={[text.muted, styles.note2]}>A signature can also be captured — that stays on the web CRM for now.</Text>
              </View>
            ) : (
              <Text style={[text.muted, styles.note2]}>The customer's signature on a report is taken on the web CRM.</Text>
            )}
            <Button title="Add Report" variant="secondary" loading={doing('reports')} disabled={act.isPending} onPress={addReport} />
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={[text.h2, styles.section]}>Parts used ({t.parts.length})</Text>
        {t.parts.map((p) => (
          <View key={p.id} style={styles.partRow}>
            <Text style={[text.body, styles.flex]}>
              {p.partName} × {Number(p.qty)}
            </Text>
            <Text style={text.body}>{formatINR(p.cost)}</Text>
          </View>
        ))}
        {t.parts.length > 0 ? <Row label="Parts total" value={formatINR(t.partsTotal)} /> : null}
        {t.canWork && working ? (
          <View style={styles.gap}>
            {part.productVariantId ? (
              <View style={styles.pickedPart}>
                <Text style={[text.body, styles.flex]} numberOfLines={1}>
                  {part.partName}
                </Text>
                <Pressable onPress={() => setPart((p) => ({ ...p, productVariantId: undefined, partName: '' }))} accessibilityRole="button" accessibilityLabel="Change part">
                  <Text style={styles.changeLink}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Field label="Pick from catalogue (type 2+ letters), or just type a part name below" value={partInput} onChangeText={setPartInput} autoCapitalize="none" autoCorrect={false} placeholder="Name, code, rating…" />
                {partResults.data?.items.map((v) => (
                  <Pressable
                    key={v.id}
                    style={styles.result}
                    onPress={() => {
                      setPart((prev) => ({ ...prev, productVariantId: v.id, partName: variantTitle(v) }));
                      setPartInput('');
                      setPartSearch('');
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={text.body}>{variantTitle(v)}</Text>
                    <Text style={text.muted}>{v.productCode}</Text>
                  </Pressable>
                ))}
                {partResults.data && partResults.data.items.length === 0 ? <Text style={text.muted}>No product matches.</Text> : null}
              </>
            )}
            <Field label="Part name" value={part.partName} onChangeText={(v) => setPart((p) => ({ ...p, partName: v, productVariantId: undefined }))} maxLength={160} editable={!part.productVariantId} />
            <View style={styles.two}>
              <View style={styles.flex}>
                <Field label="Qty" value={part.qty} onChangeText={(v) => setPart((p) => ({ ...p, qty: v }))} keyboardType="decimal-pad" />
              </View>
              <View style={styles.flex}>
                <Field label="Cost (₹)" value={part.cost} onChangeText={(v) => setPart((p) => ({ ...p, cost: v }))} keyboardType="decimal-pad" />
              </View>
            </View>
            <Button title="Add Part" variant="secondary" loading={doing('parts')} disabled={act.isPending} onPress={addPart} />
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={[text.h2, styles.section]}>Photos ({t.photos.length})</Text>
        {t.photos
          .filter((p) => p.stored)
          .map((p) => (
            <View key={p.id} style={styles.photo}>
              <AuthImage path={`/service-tickets/${id}/photos/${p.id}`} cacheName={`ticket-${id}-${p.id}.jpg`} />
              {p.caption ? <Text style={text.muted}>{p.caption}</Text> : null}
            </View>
          ))}
        {t.status !== 'CLOSED' && t.status !== 'CANCELLED' ? <PhotoAdder uploadPath={`/service-tickets/${id}/photos`} withCaption onUploaded={() => void qc.invalidateQueries({ queryKey: ['service'] })} /> : null}
      </Card>

      <Card>
        <Text style={[text.h2, styles.section]}>Revisits ({t.revisits.length})</Text>
        {t.revisits.map((r) => (
          <View key={r.id} style={styles.entry}>
            <Text style={text.body}>
              {formatDate(r.visitDate)} · {enumLabel(r.status)}
            </Text>
            <Text style={text.muted}>{r.reason}</Text>
            {r.remarks ? <Text style={text.muted}>Remarks: {r.remarks}</Text> : null}
            {t.canWork && r.status === 'SCHEDULED' ? (
              <View style={styles.gap}>
                <ReasonAction
                  title="Complete This Revisit"
                  label="What was done on this visit?"
                  confirmTitle="Save Revisit as Done"
                  busy={completeRevisit.isPending && completeRevisit.variables?.revisitId === r.id}
                  disabled={completeRevisit.isPending}
                  onSubmit={(remarks) => {
                    setError(null);
                    completeRevisit.mutate({ revisitId: r.id, remarks });
                  }}
                />
              </View>
            ) : null}
          </View>
        ))}
        {t.canWork && (working || t.status === 'PENDING' || t.status === 'REVISIT_REQUIRED') ? (
          <View style={styles.gap}>
            <Text style={styles.label}>Revisit date</Text>
            <Pressable style={styles.dateBox} onPress={() => setPickingDate(true)} accessibilityRole="button" accessibilityLabel="Revisit date">
              <Text style={text.body}>{revisitDate.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</Text>
            </Pressable>
            {pickingDate ? (
              <DateTimePicker
                value={revisitDate}
                mode="date"
                minimumDate={new Date()}
                onChange={(event, picked) => {
                  setPickingDate(false);
                  if (event.type !== 'dismissed' && picked) setRevisitDate(picked);
                }}
              />
            ) : null}
            <Field label="Why is a revisit needed?" value={revisitReason} onChangeText={setRevisitReason} multiline maxLength={2000} />
            <Button title="Book Revisit" variant="secondary" loading={doing('revisits')} disabled={act.isPending} onPress={bookRevisit} />
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

/** Log a complaint. The server finds the covering warranty from the serial number; a coordinator assigns the engineer on the web CRM. */
export function TicketFormScreen({ navigation }: NativeStackScreenProps<ServiceStackParams, 'TicketForm'>) {
  const qc = useQueryClient();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [form, setForm] = useState({ issueDescription: '', serialNo: '', contactName: '', contactPhone: '', priority: 'MEDIUM' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () =>
      api.post<TicketDetail>('/service-tickets', {
        customerId: customer!.id,
        issueDescription: form.issueDescription.trim(),
        priority: form.priority,
        serialNo: form.serialNo.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
      }),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: ['service'] });
      navigation.replace('TicketDetail', { id: t.id, no: t.ticketNo });
    },
    onError: (err) => setError(errorText(err, 'Could not log the complaint.')),
  });

  function submit() {
    if (!customer) return setError('Choose the customer.');
    if (form.issueDescription.trim().length < 5) return setError('Describe the problem.');
    setError(null);
    create.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <CustomerPicker value={customer} onChange={setCustomer} />
        <Field label="Problem *" value={form.issueDescription} onChangeText={set('issueDescription')} multiline maxLength={4000} />
        <Field label="Serial number (if known)" value={form.serialNo} onChangeText={set('serialNo')} autoCapitalize="characters" autoCorrect={false} maxLength={80} />
        <Field label="Contact person at site" value={form.contactName} onChangeText={set('contactName')} maxLength={120} />
        <Field label="Contact mobile" value={form.contactPhone} onChangeText={set('contactPhone')} keyboardType="phone-pad" maxLength={20} />
        <ChipSelect label="Priority *" value={form.priority} options={PRIORITIES} onChange={(v) => v && set('priority')(v)} />
        <Button title="Log Complaint" onPress={submit} loading={create.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  status: { fontSize: 13, fontWeight: '700' },
  sub: { marginTop: 2, marginBottom: space.sm },
  section: { marginBottom: space.sm },
  gap: { marginTop: space.md },
  note: { marginBottom: space.sm },
  note2: { marginTop: space.sm },
  foot: { textAlign: 'center', marginBottom: space.md },
  photo: { marginBottom: space.md, gap: 4 },
  entry: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  partRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pickedPart: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.md },
  changeLink: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  result: { padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.surface },
  two: { flexDirection: 'row', gap: space.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  dateBox: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, justifyContent: 'center', backgroundColor: colors.surface, marginBottom: space.md },
});
