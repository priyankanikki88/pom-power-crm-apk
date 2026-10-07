import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { CustomerPicker, type PickedCustomer } from '../components/CustomerPicker';
import { ChipSelect } from '../components/inputs';
import { AuthImage, PhotoAdder } from '../components/photos';
import { ReasonAction } from '../components/ReasonAction';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { actionTitle, savedOnPhoneAlert } from '../lib/offlineNotice';
import { sendOrQueue } from '../lib/outbox';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { ServiceStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import { SURVEY_LABEL, type InstallationDetail, type SiteSurvey, type SurveyType } from '../types';
import { SERVICE_TONE } from './ServiceScreen';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const opt = (v: string) => v.trim() || undefined;

/**
 * One installation job. The assigned engineer starts it and completes it here: serial number, who received it, notes,
 * and — by default — registering the product's warranty from today in the same step. The customer's signature and
 * rescheduling are done on the web CRM.
 */
export function InstallationDetailScreen({ route }: NativeStackScreenProps<ServiceStackParams, 'InstallationDetail'>) {
  const { id } = route.params;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['service', 'installation', id], queryFn: () => api.get<InstallationDetail>(`/installations/${id}`) });
  const i = q.data;
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [serialNo, setSerialNo] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [registerWarranty, setRegisterWarranty] = useState(true);

  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) => sendOrQueue({ title: `Installation ${route.params.no} — ${actionTitle(action)}`, method: 'POST', path: `/installations/${id}/${action}`, body, refresh: ['service'] }),
    onSuccess: (res) => {
      if (res.queued) savedOnPhoneAlert();
      setCompleting(false);
      void qc.invalidateQueries({ queryKey: ['service'] });
    },
    onError: (err) => setError(errorText(err, 'Could not save.')),
  });
  const run = (action: string, body?: unknown) => {
    setError(null);
    act.mutate({ action, body });
  };

  if (q.isLoading) return <ActivityIndicator style={{ padding: space.xl }} color={colors.primary} />;
  if (!i) return <View style={styles.body}><ErrorBox message={errorText(q.error, 'Could not load this installation.')} /></View>;
  const open = i.status === 'SCHEDULED' || i.status === 'IN_PROGRESS';
  const serial = serialNo ?? i.serialNo ?? '';
  const phone = i.engineer?.phone;
  const address = i.address ? [i.address.line1, i.address.line2, i.address.city, i.address.state, i.address.pincode].filter(Boolean).join(', ') : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.head}>
          <Text style={[text.h1, styles.flex]}>{i.installationNo ?? 'Installation'}</Text>
          <Text style={[styles.status, { color: SERVICE_TONE[i.status] ?? colors.muted }]}>{enumLabel(i.status)}</Text>
        </View>
        <Text style={[text.h2, styles.sub]}>{i.customer.name}</Text>
        <Row label="Product" value={i.productTitle} />
        <Row label="Serial no." value={i.serialNo} />
        <Row label="Planned date" value={formatDate(i.installationDate)} />
        <Row label="Completed" value={formatDate(i.completedAt)} />
        <Row label="Site address" value={address} />
        <Row label="Engineer" value={i.engineer?.name ?? 'Not assigned'} />
        <Row label="Received by" value={i.signedBy} />
        <Row label="Notes" value={i.notes} />
        {address ? (
          <View style={styles.gap}>
            <Button title="Open in Maps" variant="secondary" onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)} />
          </View>
        ) : null}
        {phone && !i.canWork ? (
          <View style={styles.gap}>
            <Button title="Call Engineer" variant="secondary" onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} />
          </View>
        ) : null}
      </Card>

      {error ? <ErrorBox message={error} /> : null}

      {i.canWork && open ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Work</Text>
          {i.status === 'SCHEDULED' && !completing ? <Button title="Start Installation" loading={act.isPending && act.variables?.action === 'start'} disabled={act.isPending} onPress={() => run('start')} /> : null}
          {!completing ? (
            <View style={styles.gap}>
              <Button title="Complete Installation…" variant={i.status === 'IN_PROGRESS' ? 'primary' : 'secondary'} disabled={act.isPending} onPress={() => setCompleting(true)} />
            </View>
          ) : (
            <>
              <Field label="Serial number" value={serial} onChangeText={setSerialNo} autoCapitalize="characters" autoCorrect={false} maxLength={80} />
              <Field label="Received by (customer's person)" value={signedBy} onChangeText={setSignedBy} maxLength={120} />
              <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text style={text.body}>Register warranty from today</Text>
                  <Text style={text.muted}>{i.warrantyDefault ? i.warrantyDefault.label : 'Standard warranty period'}</Text>
                </View>
                <Switch value={registerWarranty} onValueChange={setRegisterWarranty} accessibilityLabel="Register warranty from today" />
              </View>
              <Button
                title="Save as Completed"
                loading={act.isPending && act.variables?.action === 'complete'}
                disabled={act.isPending}
                onPress={() => run('complete', { serialNo: opt(serial), signedBy: opt(signedBy), notes: opt(notes), registerWarranty })}
              />
              <View style={styles.gap}>
                <Button title="Back" variant="secondary" onPress={() => setCompleting(false)} />
              </View>
            </>
          )}
        </Card>
      ) : null}
      {!i.canWork && open ? <Text style={[text.muted, styles.foot]}>Only the assigned engineer or a service coordinator completes this job.</Text> : null}

      <Card>
        <Text style={[text.h2, styles.section]}>Warranty</Text>
        {i.warrantyRecords.length === 0 ? <Text style={text.muted}>No warranty registered{i.status === 'COMPLETED' ? '' : ' yet — it is registered when the job is completed'}.</Text> : null}
        {i.warrantyRecords.map((w) => (
          <View key={w.id} style={styles.entry}>
            <Text style={text.body}>
              {enumLabel(w.effectiveStatus)} · {formatDate(w.warrantyStart)} – {formatDate(w.warrantyEnd)}
            </Text>
            {w.effectiveStatus === 'ACTIVE' ? <Text style={text.muted}>{w.daysLeft} days left</Text> : null}
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

/** One site survey: what was planned and found. The engineer fills in the findings and marks it completed. */
export function SurveyDetailScreen({ route }: NativeStackScreenProps<ServiceStackParams, 'SurveyDetail'>) {
  const { id } = route.params;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['service', 'survey', id], queryFn: () => api.get<SiteSurvey>(`/site-surveys/${id}`) });
  const s = q.data;
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ requirement: string; technicalRemarks: string; estimatedCapacity: string; recommendedProductText: string; nextAction: string } | null>(null);
  const done = (res: { queued: boolean }) => {
    if (res.queued) savedOnPhoneAlert();
    setEdit(null);
    void qc.invalidateQueries({ queryKey: ['service'] });
  };
  const save = useMutation({ mutationFn: (body: Record<string, string | undefined>) => sendOrQueue({ title: `Site survey ${route.params.no} — Findings`, method: 'PATCH', path: `/site-surveys/${id}`, body, refresh: ['service'] }), onSuccess: done, onError: (err) => setError(errorText(err, 'Could not save the findings.')) });
  const act = useMutation({ mutationFn: ({ action, body }: { action: 'complete' | 'cancel'; body?: unknown }) => sendOrQueue({ title: `Site survey ${route.params.no} — ${actionTitle(action)}`, method: 'POST', path: `/site-surveys/${id}/${action}`, body, refresh: ['service'] }), onSuccess: done, onError: (err) => setError(errorText(err, 'Could not save.')) });

  if (q.isLoading) return <ActivityIndicator style={{ padding: space.xl }} color={colors.primary} />;
  if (!s) return <View style={styles.body}><ErrorBox message={errorText(q.error, 'Could not load this survey.')} /></View>;
  const canWork = Boolean(s.canWork) && s.status === 'SCHEDULED';
  const phone = s.contactPhone;
  const busy = save.isPending || act.isPending;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.head}>
          <Text style={[text.h1, styles.flex]}>{s.surveyNo}</Text>
          <Text style={[styles.status, { color: SERVICE_TONE[s.status] ?? colors.muted }]}>{enumLabel(s.status)}</Text>
        </View>
        <Text style={[text.h2, styles.sub]}>{s.customer.name}</Text>
        <Row label="Type" value={SURVEY_LABEL[s.surveyType]} />
        <Row label="Date" value={formatDate(s.surveyDate)} />
        <Row label="Site address" value={s.siteAddress} />
        <Row label="Contact" value={s.contactName} />
        <Row label="Mobile" value={phone} />
        <Row label="Engineer" value={s.engineer?.name ?? 'Not assigned'} />
        <Row label="Purpose" value={s.purpose} />
        {phone ? (
          <View style={styles.gap}>
            <Button title="Call Contact" variant="secondary" onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} />
          </View>
        ) : null}
      </Card>

      {error ? <ErrorBox message={error} /> : null}

      <Card>
        <Text style={[text.h2, styles.section]}>Findings</Text>
        {edit ? (
          <>
            <Field label="Customer's requirement" value={edit.requirement} onChangeText={(v) => setEdit({ ...edit, requirement: v })} multiline maxLength={4000} />
            <Field label="Technical remarks" value={edit.technicalRemarks} onChangeText={(v) => setEdit({ ...edit, technicalRemarks: v })} multiline maxLength={4000} />
            <Field label="Estimated capacity" value={edit.estimatedCapacity} onChangeText={(v) => setEdit({ ...edit, estimatedCapacity: v })} maxLength={190} />
            <Field label="Recommended product" value={edit.recommendedProductText} onChangeText={(v) => setEdit({ ...edit, recommendedProductText: v })} maxLength={190} />
            <Field label="Next action" value={edit.nextAction} onChangeText={(v) => setEdit({ ...edit, nextAction: v })} multiline maxLength={2000} />
            <Button
              title="Save Findings"
              loading={save.isPending}
              disabled={busy}
              onPress={() => {
                setError(null);
                save.mutate({ requirement: edit.requirement.trim(), technicalRemarks: edit.technicalRemarks.trim(), estimatedCapacity: edit.estimatedCapacity.trim(), recommendedProductText: edit.recommendedProductText.trim(), nextAction: edit.nextAction.trim() });
              }}
            />
            <View style={styles.gap}>
              <Button title="Back" variant="secondary" onPress={() => setEdit(null)} />
            </View>
          </>
        ) : (
          <>
            <Row label="Requirement" value={s.requirement} />
            <Row label="Technical remarks" value={s.technicalRemarks} />
            <Row label="Estimated capacity" value={s.estimatedCapacity} />
            <Row label="Recommended" value={s.recommendedProductTitle ?? s.recommendedProductText} />
            <Row label="Next action" value={s.nextAction} />
            {!s.requirement && !s.technicalRemarks && !s.nextAction ? <Text style={text.muted}>Nothing recorded yet.</Text> : null}
            {canWork ? (
              <View style={styles.gap}>
                <Button
                  title="Write Findings"
                  variant="secondary"
                  onPress={() => setEdit({ requirement: s.requirement ?? '', technicalRemarks: s.technicalRemarks ?? '', estimatedCapacity: s.estimatedCapacity ?? '', recommendedProductText: s.recommendedProductText ?? '', nextAction: s.nextAction ?? '' })}
                />
              </View>
            ) : null}
          </>
        )}
      </Card>

      {canWork && !edit ? (
        <Card>
          <Button
            title="Mark Survey Completed"
            loading={act.isPending && act.variables?.action === 'complete'}
            disabled={busy}
            onPress={() => {
              setError(null);
              act.mutate({ action: 'complete' });
            }}
          />
          <View style={styles.gap}>
            <ReasonAction title="Cancel Survey" label="Why is the survey cancelled?" confirmTitle="Confirm Cancel" danger busy={act.isPending && act.variables?.action === 'cancel'} disabled={busy} onSubmit={(reason) => act.mutate({ action: 'cancel', body: { reason } })} />
          </View>
        </Card>
      ) : null}
      <Card>
        <Text style={[text.h2, styles.section]}>Site photos ({s.files?.length ?? 0})</Text>
        {(s.files ?? []).map((f) =>
          f.mimeType.startsWith('image/') ? (
            <View key={f.id} style={styles.photo}>
              <AuthImage path={`/site-surveys/${id}/files/${f.id}`} cacheName={`survey-${id}-${f.id}.jpg`} />
              {f.caption ? <Text style={text.muted}>{f.caption}</Text> : null}
            </View>
          ) : (
            <Text key={f.id} style={text.muted}>
              {f.fileName}
            </Text>
          ),
        )}
        {s.status !== 'CANCELLED' && s.canWork ? <PhotoAdder uploadPath={`/site-surveys/${id}/files`} withCaption onUploaded={() => void qc.invalidateQueries({ queryKey: ['service'] })} /> : null}
      </Card>
    </ScrollView>
  );
}

const SURVEY_TYPES = (Object.keys(SURVEY_LABEL) as SurveyType[]).map((value) => ({ value, label: SURVEY_LABEL[value] }));

/** Plan a site survey. No engineer is sent: the server gives it to the creator when they are an engineer, and leaves it unassigned for a coordinator (who assigns it on the web CRM). */
export function SurveyFormScreen({ navigation }: NativeStackScreenProps<ServiceStackParams, 'SurveyForm'>) {
  const qc = useQueryClient();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [surveyType, setSurveyType] = useState<SurveyType>('PRE_INSTALLATION');
  const [date, setDate] = useState(() => new Date());
  const [picking, setPicking] = useState(false);
  const [form, setForm] = useState({ siteAddress: '', contactName: '', contactPhone: '', purpose: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => api.post<SiteSurvey>('/site-surveys', { customerId: customer!.id, surveyType, surveyDate: isoDate(date), siteAddress: opt(form.siteAddress), contactName: opt(form.contactName), contactPhone: opt(form.contactPhone), purpose: opt(form.purpose) }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ['service'] });
      navigation.replace('SurveyDetail', { id: s.id, no: s.surveyNo });
    },
    onError: (err) => setError(errorText(err, 'Could not save the survey.')),
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <CustomerPicker value={customer} onChange={setCustomer} />
        <ChipSelect label="Survey type *" value={surveyType} options={SURVEY_TYPES} onChange={(v) => v && setSurveyType(v)} />
        <Text style={styles.label}>Survey date *</Text>
        <Pressable style={styles.dateBox} onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel="Survey date">
          <Text style={text.body}>{date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</Text>
        </Pressable>
        {picking ? (
          <DateTimePicker
            value={date}
            mode="date"
            onChange={(event, picked) => {
              setPicking(false);
              if (event.type !== 'dismissed' && picked) setDate(picked);
            }}
          />
        ) : null}
        <Field label="Site address" value={form.siteAddress} onChangeText={set('siteAddress')} multiline maxLength={2000} />
        <Field label="Contact person" value={form.contactName} onChangeText={set('contactName')} maxLength={150} />
        <Field label="Contact mobile" value={form.contactPhone} onChangeText={set('contactPhone')} keyboardType="phone-pad" maxLength={20} />
        <Field label="Purpose" value={form.purpose} onChangeText={set('purpose')} multiline maxLength={4000} />
        <Button
          title="Save Survey"
          loading={create.isPending}
          onPress={() => {
            if (!customer) return setError('Choose the customer.');
            setError(null);
            create.mutate();
          }}
        />
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
  foot: { textAlign: 'center', marginBottom: space.md },
  photo: { marginBottom: space.md, gap: 4 },
  entry: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  dateBox: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, justifyContent: 'center', backgroundColor: colors.surface, marginBottom: space.md },
});
