import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, DateTimeField } from '../components/inputs';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen, nextHour, pickedParts } from '../lib/dates';
import { sendOrQueue, useOutbox } from '../lib/outbox';
import type { FollowUpsStackParams } from '../navigation';
import { colors, space } from '../theme';
import { STAGE_LABEL, TYPE_LABEL, type FollowUp, type FollowUpType, type FunnelStage } from '../types';

const STAGES = (Object.keys(STAGE_LABEL) as FunnelStage[]).map((value) => ({ value, label: STAGE_LABEL[value] }));
const TYPES = (Object.keys(TYPE_LABEL) as FollowUpType[]).map((value) => ({ value, label: TYPE_LABEL[value] }));
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
/** What came of the follow-up — the same list as the web CRM. Picking one sets the customer's stage; it can be changed. */
const OUTCOMES: Array<{ label: string; stage?: FunnelStage }> = [
  { label: 'Connected — interested', stage: 'INTERESTED' },
  { label: 'Requirement discussed', stage: 'INTERESTED' },
  { label: 'Quotation requested', stage: 'INTERESTED' },
  { label: 'Quotation sent — awaiting reply', stage: 'NEGOTIATION' },
  { label: 'Negotiation in progress', stage: 'NEGOTIATION' },
  { label: 'Meeting / site visit fixed', stage: 'INTERESTED' },
  { label: 'Asked to call back later', stage: 'FOLLOW_UP' },
  { label: 'Not reachable / no answer', stage: 'FOLLOW_UP' },
  { label: 'Order confirmed', stage: 'CONVERTED' },
  { label: 'Not interested', stage: 'LOST' },
  { label: 'Put on hold by the customer', stage: 'ON_HOLD' },
  { label: 'Other' },
];
const OUTCOME_OPTIONS = OUTCOMES.map((o) => ({ value: o.label, label: o.label }));
/** Stages that need no further follow-up; every other stage must have the next one planned (the server enforces it). */
const CLOSING: FunnelStage[] = ['CONVERTED', 'ACTIVE_CUSTOMER', 'LOST', 'ON_HOLD'];
const NEXT_IN: Array<{ value: string; label: string }> = [
  { value: '1', label: 'Tomorrow' },
  { value: '3', label: 'In 3 days' },
  { value: '7', label: 'In 1 week' },
  { value: '15', label: 'In 15 days' },
  { value: '30', label: 'In 1 month' },
];
/** 11 in the morning, `days` from today. */
function inDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(11, 0, 0, 0);
  return d;
}

/** One follow-up: what was planned, and — while it is still planned — "Mark Done" (what happened, the customer's stage, and the next step) or cancel. */
export function FollowUpDetailScreen({ route, navigation }: NativeStackScreenProps<FollowUpsStackParams, 'FollowUpDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['follow-ups', 'one', id], queryFn: () => api.get<FollowUp>(`/follow-ups/${id}`) });
  const f = q.data;

  const [result, setResult] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [quick, setQuick] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');
  const [stage, setStage] = useState<FunnelStage | null>(null);
  const [nextAt, setNextAt] = useState(nextHour);
  const [nextType, setNextType] = useState<FollowUpType>('CALL');
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  // A change to this follow-up made without a network and not sent yet: no second one until it has gone.
  const waiting = useOutbox().some((e) => e.path.startsWith(`/follow-ups/${id}/`));
  const done = (res: { queued: boolean }) => {
    void qc.invalidateQueries({ queryKey: ['follow-ups'] });
    void qc.invalidateQueries({ queryKey: ['customer'] });
    if (res.queued) Alert.alert('Saved on this phone', 'There is no network right now. It will be sent on its own when the network is back — see More → Waiting to Send.');
    navigation.goBack();
  };
  const complete = useMutation({
    mutationFn: () =>
      sendOrQueue({
        title: `Follow-up done — ${f?.customer.name ?? ''}`,
        method: 'POST',
        path: `/follow-ups/${id}/complete`,
        body: { outcome: [result, details.trim()].filter(Boolean).join(' — '), remarks: remarks.trim() || undefined, stage: stage ?? undefined, next: needsNext ? { ...pickedParts(nextAt), type: nextType } : undefined },
        refresh: ['follow-ups', 'customer'],
      }),
    onSuccess: done,
    onError: (err) => setError(errorText(err, 'Could not save the follow-up.')),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => sendOrQueue({ title: `Follow-up cancelled — ${f?.customer.name ?? ''}`, method: 'POST', path: `/follow-ups/${id}/cancel`, body: { reason }, refresh: ['follow-ups', 'customer'] }),
    onSuccess: done,
    onError: (err) => setError(errorText(err, 'Could not cancel the follow-up.')),
  });

  // The stage the customer will be in once this is saved decides whether a next follow-up is needed.
  const stageAfter = stage ?? f?.customer.funnelStage ?? null;
  const needsNext = !(stageAfter && CLOSING.includes(stageAfter));
  function pickResult(label: string | null) {
    setResult(label);
    const to = OUTCOMES.find((o) => o.label === label)?.stage;
    if (to) setStage(to);
  }
  function submit() {
    if (!result) return setError('Choose what happened.');
    if (result === 'Other' && details.trim().length < 2) return setError('Write what happened.');
    if (stage === 'LOST' && !remarks.trim()) return setError('Write in the remarks why the customer was lost.');
    if (needsNext && nextAt.getTime() <= Date.now()) return setError('The next follow-up must be in the future.');
    setError(null);
    complete.mutate();
  }
  function submitCancel() {
    if (reason.trim().length < 3) return setError('Write why this follow-up is being cancelled.');
    setError(null);
    cancel.mutate(reason.trim());
  }

  if (q.isLoading) return <ActivityIndicator style={{ padding: space.xl }} color={colors.primary} />;
  if (!f) return <View style={styles.body}><ErrorBox message={errorText(q.error, 'Could not load this follow-up.')} /></View>;
  const phone = f.contact?.phone;
  const open = f.status === 'PLANNED' && !waiting;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={text.h1}>{f.customer.name}</Text>
        <Text style={[text.muted, styles.sub]}>{f.customer.customerCode}</Text>
        <Row label="When" value={formatWhen(f.scheduledAt)} />
        <Row label="Type" value={TYPE_LABEL[f.type]} />
        <Row label="Status" value={f.displayStatus === 'OVERDUE' ? 'Overdue' : f.status === 'PLANNED' ? 'Planned' : f.status === 'DONE' ? 'Done' : 'Cancelled'} />
        <Row label="Purpose" value={f.purpose} />
        <Row label="Contact" value={f.contact ? `${f.contact.name}${phone ? ` · ${phone}` : ''}` : null} />
        <Row label="Sales person" value={f.salesPerson.fullName} />
        <Row label="Outcome" value={f.outcome} />
        <Row label="Remarks" value={f.remarks} />
        {phone ? (
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button title="Call" variant="secondary" onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} />
            </View>
          </View>
        ) : null}
      </Card>

      {waiting ? <Text style={[text.muted, styles.sub]}>A change to this follow-up is saved on this phone and waiting for the network. It will be sent on its own.</Text> : null}
      {open && hasPermission('followup.manage') ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Mark Done</Text>
          {error ? <ErrorBox message={error} /> : null}
          <ChipSelect label="1. What happened? *" value={result} options={OUTCOME_OPTIONS} onChange={pickResult} />
          <Field label={result === 'Other' ? 'Details *' : 'Details'} value={details} onChangeText={setDetails} multiline maxLength={1800} />
          <ChipSelect label="2. Customer stage now" value={stage} options={STAGES} onChange={setStage} allowClear />
          <Field label={stage === 'LOST' ? 'Remarks — why was it lost? *' : 'Remarks'} value={remarks} onChangeText={setRemarks} multiline maxLength={4000} />
          <Text style={[text.h2, styles.section]}>3. Next step</Text>
          {needsNext ? (
            <>
              <ChipSelect
                label="Next follow-up *"
                value={quick}
                options={NEXT_IN}
                onChange={(v) => {
                  setQuick(v);
                  if (v) setNextAt(inDays(Number(v)));
                }}
              />
              <DateTimeField
                label="Date and time"
                value={nextAt}
                onChange={(d) => {
                  setQuick(null);
                  setNextAt(d);
                }}
                minimumDate={new Date()}
              />
              <ChipSelect label="Type" value={nextType} options={TYPES} onChange={(v) => v && setNextType(v)} />
            </>
          ) : (
            <Text style={[text.muted, styles.sub]}>No further follow-up is needed at the stage “{STAGE_LABEL[stageAfter!]}”.</Text>
          )}
          <Button title="Save as Done" onPress={submit} loading={complete.isPending} />
          <View style={styles.gap} />
          {cancelling ? (
            <>
              <Field label="Reason for cancelling *" value={reason} onChangeText={setReason} multiline maxLength={1000} />
              <Button title="Confirm Cancel" variant="danger" onPress={submitCancel} loading={cancel.isPending} />
            </>
          ) : (
            <Button title="Cancel this follow-up" variant="secondary" onPress={() => setCancelling(true)} />
          )}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  sub: { marginBottom: space.sm },
  section: { marginBottom: space.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  gap: { height: space.sm },
});
