import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { CustomerPicker, type PickedCustomer } from '../components/CustomerPicker';
import { ChipSelect, DateTimeField } from '../components/inputs';
import { SelfieCamera } from '../components/SelfieCamera';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import type { Paginated, TicketSummary } from '../types';
import { startFieldTracking, stopFieldTracking } from '../lib/location';
import {
  discardQueued,
  ensureRegistered,
  flushPunchQueue,
  freshFix,
  isSupported,
  preparePhoto,
  punch,
  queuedPunches,
  refusalOf,
  type Fix,
  type Photo,
  type PunchMode,
  type QueuedPunch,
  type Verification,
} from '../lib/verifiedAttendance';
import { colors, space } from '../theme';

/** GET /attendance/status — what the verified flow needs to know about today. */
export interface VerifiedStatus {
  date: string;
  verificationMode: 'OFF' | 'SOFT' | 'ENFORCED';
  consentAccepted: boolean;
  switches: { backgroundTracking: boolean; allowWfh: boolean; allowField: boolean; allowTour: boolean; allowWeb: boolean };
  policy: { cutoff: string; halfDayBefore: string };
  workingDay: boolean;
  holiday: string | null;
  next: 'PUNCH_IN' | 'PUNCH_OUT' | 'DONE' | 'RESOLVE_PREVIOUS' | 'NONE';
  unresolvedDate: string | null;
  today: { status: string; verificationStatus: Verification | null; punchMode: PunchMode | null; punchInAt: string | null; punchOutAt: string | null; workedMinutes: number | null; lateMinutes: number | null } | null;
  activeDevices: number;
  wfhLocation: { status: string; address: string } | null;
  tours: Array<{ tourNo: string; destination: string; status: string; emergency: boolean }>;
  pendingExceptions: number;
}

interface LocationCheck {
  ok: boolean;
  canSendForApproval: boolean;
  distanceM: number | null;
  radiusM: number | null;
  preferredAccuracyM: number;
  checks: Array<{ code: string; result: string; detail: string }>;
}

const MODE_LABEL: Record<PunchMode, string> = { OFFICE: 'Office', WFH: 'Work From Home', FIELD_GENERAL: 'Field Visit', FIELD_CUSTOMER: 'Customer Visit', TOUR: 'Official Tour' };
const V_LABEL: Record<Verification, string> = { VERIFIED: 'Verified', PENDING: 'Pending approval', FLAGGED: 'Flagged for review', REJECTED: 'Rejected' };
const V_TONE: Record<Verification, string> = { VERIFIED: colors.success, PENDING: colors.warning, FLAGGED: colors.danger, REJECTED: colors.danger };
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');
const hm = (m: number | null) => (m === null ? '—' : `${Math.floor(m / 60)}h ${m % 60}m`);

/** The status call; a server without verified attendance (404) counts as switched off. */
export function useVerifiedStatus() {
  return useQuery({
    queryKey: ['attendance', 'status'],
    queryFn: async () => {
      try {
        return await api.get<VerifiedStatus>('/attendance/status');
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

function Consent({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <Text style={text.h2}>Before your first verified punch</Text>
      <Text style={styles.notice}>• Each punch-in and punch-out records where you are at that moment and a live selfie.</Text>
      <Text style={styles.notice}>• Selfies are deleted automatically after 90 days. The punch record (time, place, result) stays.</Text>
      <Text style={styles.notice}>• Only you, your reporting manager and HR can see your selfies; every view is logged.</Text>
      <Text style={styles.notice}>• This phone is registered to you for attendance (you can have two phones). If it is lost, remove it on the website.</Text>
      {error ? <ErrorBox message={error} /> : null}
      <Button
        title="I understand and agree"
        loading={busy}
        onPress={() => {
          setBusy(true);
          api
            .post('/attendance/consent', { channel: 'MOBILE' })
            .then(onDone)
            .catch((e) => setError(refusalOf(e).message))
            .finally(() => setBusy(false));
        }}
      />
    </Card>
  );
}

/** Offline punches waiting on this phone, and any the server refused. */
function Queue({ userId, items, onChanged }: { userId: string; items: QueuedPunch[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  if (items.length === 0) return null;
  const waiting = items.filter((q) => !q.failed);
  const failed = items.filter((q) => q.failed);
  return (
    <Card>
      {waiting.length > 0 ? (
        <>
          <Text style={styles.warn}>{waiting.length} punch(es) taken offline are waiting to be sent. They are sent automatically when the phone is online, and then go to your manager for approval.</Text>
          <Button
            title="Send now"
            variant="secondary"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void flushPunchQueue(userId).finally(() => {
                setBusy(false);
                onChanged();
              });
            }}
          />
        </>
      ) : null}
      {failed.map((q) => (
        <View key={q.eventUuid} style={styles.gap}>
          <Text style={styles.bad}>
            Offline punch of {new Date(q.fields.capturedAt ?? q.queuedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} was refused: {q.lastError}
          </Text>
          <Button title="Remove it" variant="secondary" onPress={() => void discardQueued(q.eventUuid).then(onChanged)} />
        </View>
      ))}
    </Card>
  );
}

/** A day left open: ask for the punch-out time to be recorded, which unblocks today's punch-in. */
function MissedPunchOut({ date, onDone }: { date: string; onDone: () => void }) {
  const [at, setAt] = useState(() => new Date(`${date}T18:00:00+05:30`));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <Text style={styles.warn}>You did not punch out on {formatDate(date)}. Tell your manager when you left; after that you can punch in today.</Text>
      <DateTimeField label="I left at" value={at} onChange={setAt} />
      <Field label="What happened" value={reason} onChangeText={setReason} maxLength={1000} />
      {error ? <ErrorBox message={error} /> : null}
      <Button
        title="Send missed punch-out"
        loading={busy}
        disabled={reason.trim().length < 5}
        onPress={() => {
          setBusy(true);
          setError(null);
          api
            .post('/attendance/exceptions', { type: 'MISSED_PUNCH', date, reason: reason.trim(), requestedOutAt: at.toISOString() })
            .then(onDone)
            .catch((e) => setError(refusalOf(e).message))
            .finally(() => setBusy(false));
        }}
      />
    </Card>
  );
}

/** No approved home yet: request where the phone is now (the employee should be at home). */
function WfhRequest({ pending, onDone }: { pending: boolean; onDone: () => void }) {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (pending) return <Text style={styles.warn}>Your home location is waiting for approval. Work From Home punches work once it is approved.</Text>;
  return (
    <View style={styles.gap}>
      <Text style={styles.warn}>Work From Home needs an approved home location. At home, send this location for approval:</Text>
      <Field label="Home address" value={address} onChangeText={setAddress} multiline maxLength={1000} />
      {error ? <ErrorBox message={error} /> : null}
      <Button
        title="Send my home location"
        variant="secondary"
        loading={busy}
        disabled={address.trim().length < 5}
        onPress={() => {
          setBusy(true);
          setError(null);
          freshFix()
            .then((f) => api.post('/attendance/wfh-locations', { latitude: f.latitude, longitude: f.longitude, accuracy: f.accuracy ?? undefined, address: address.trim() }))
            .then(onDone)
            .catch((e) => setError(refusalOf(e).message))
            .finally(() => setBusy(false));
        }}
      />
    </View>
  );
}

/**
 * Verified punch on the phone: choose the mode (punch-in), check the location, take a live selfie — the punch is signed by
 * this registered phone and sent; with no network it waits here, encrypted, and goes for approval once sent.
 */
export function VerifiedPunchCard({ status, onChanged }: { status: VerifiedStatus; onChanged: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const type = status.next === 'PUNCH_OUT' ? 'OUT' : 'IN';
  const allowed: PunchMode[] = ['OFFICE', ...(status.switches.allowWfh ? (['WFH'] as const) : []), ...(status.switches.allowField ? (['FIELD_GENERAL', 'FIELD_CUSTOMER'] as const) : []), ...(status.switches.allowTour ? (['TOUR'] as const) : [])];
  const [modeChoice, setModeChoice] = useState<PunchMode>('OFFICE');
  const mode: PunchMode = type === 'OUT' && status.today?.punchMode ? status.today.punchMode : modeChoice;
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  // A service engineer's open tickets: a customer visit can be for one of them (its customer is then the visit's customer).
  const tickets = useQuery({
    queryKey: ['attendance', 'visit-tickets'],
    queryFn: () => api.get<Paginated<TicketSummary>>('/service-tickets', { pageSize: 100 }),
    enabled: type === 'IN' && modeChoice === 'FIELD_CUSTOMER',
    retry: false,
    staleTime: 5 * 60_000,
  });
  const openTickets = (tickets.data?.items ?? []).filter((t) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status));
  const [purpose, setPurpose] = useState('');
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [reason, setReason] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [check, setCheck] = useState<LocationCheck | null>(null);
  const [offlineCheck, setOfflineCheck] = useState(false);
  const [sitePhoto, setSitePhoto] = useState<Photo | null>(null);
  const [camera, setCamera] = useState<'selfie' | 'site' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedPunch[]>([]);

  const refreshQueue = useCallback(() => {
    if (userId) void queuedPunches(userId).then(setQueue);
  }, [userId]);
  const refreshAll = () => {
    refreshQueue();
    onChanged();
    void qc.invalidateQueries({ queryKey: ['attendance'] });
  };

  // Sends anything left offline, and keeps the background trail in line with HR's switch for this employee.
  useEffect(() => {
    if (!userId) return;
    void flushPunchQueue(userId).then((n) => {
      refreshQueue();
      if (n > 0) onChanged();
    });
    if (!status.switches.backgroundTracking) void stopFieldTracking();
    else if (status.today?.punchInAt && !status.today.punchOutAt) void startFieldTracking();
    // Runs when the employee, the switch or the open session changes — not on every refresh of the parent.
  }, [userId, status.switches.backgroundTracking, status.today?.punchInAt, status.today?.punchOutAt]);

  if (!isSupported()) return <ErrorBox message="Verified attendance works in the POM POWER Android app." />;
  if (!status.consentAccepted) return <Consent onDone={onChanged} />;

  const fieldReady =
    type === 'IN'
      ? mode === 'FIELD_GENERAL'
        ? purpose.trim().length > 0 && place.trim().length > 0
        : mode === 'FIELD_CUSTOMER'
          ? (Boolean(customer) || Boolean(ticketId)) && purpose.trim().length > 0
          : true
      : mode === 'FIELD_CUSTOMER'
        ? notes.trim().length > 0 && outcome.trim().length > 0
        : true;
  const needsReason = Boolean(check && !check.ok && check.canSendForApproval);
  const blocked = Boolean(check && !check.ok && !check.canSendForApproval);
  const wfhBlocked = mode === 'WFH' && type === 'IN' && status.wfhLocation?.status !== 'APPROVED';

  async function checkLocation() {
    setError(null);
    setDone(null);
    setBusy('location');
    setCheck(null);
    setOfflineCheck(false);
    try {
      const f = await freshFix();
      setFix(f);
      try {
        setCheck(await api.post<LocationCheck>('/attendance/location/verify', { type, mode, channel: 'MOBILE', latitude: f.latitude, longitude: f.longitude, accuracy: f.accuracy ?? undefined, fixAt: f.fixAt.toISOString(), wifiBssid: f.wifiBssid ?? undefined }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) setOfflineCheck(true);
        else throw e;
      }
    } catch (e) {
      setError(refusalOf(e).message);
    } finally {
      setBusy(null);
    }
  }

  async function onSelfie(uri: string, takenAt: Date) {
    setCamera(null);
    setBusy('send');
    setError(null);
    try {
      const selfie = await preparePhoto(uri, takenAt, true);
      // The place is read again right after the photo, so both are from the same moment.
      const f = await freshFix().catch(() => fix!);
      const res = await punch(userId, { type, mode, reason: needsReason ? reason : undefined, acceptPending: needsReason, customerId: mode === 'FIELD_CUSTOMER' && type === 'IN' && !ticketId ? customer?.id : undefined, serviceTicketId: mode === 'FIELD_CUSTOMER' && type === 'IN' ? (ticketId ?? undefined) : undefined, purpose: purpose || undefined, visitLocation: place || undefined, notes: notes || undefined, outcome: outcome || undefined }, f, selfie, sitePhoto);
      if (res.queued) {
        setDone('No network: the punch is saved on this phone (encrypted) and will be sent automatically. It then goes to your manager for approval.');
      } else {
        const v = res.result.punch.verification;
        setDone(`Punched ${type === 'IN' ? 'in' : 'out'} at ${time(res.result.punch.serverAt)} — ${V_LABEL[v]}${res.result.exception ? '. Sent to your manager for approval.' : '.'}`);
      }
      if (type === 'IN' && status.switches.backgroundTracking) await startFieldTracking();
      if (type === 'OUT') await stopFieldTracking();
      setFix(null);
      setCheck(null);
      setReason('');
      setSitePhoto(null);
      refreshAll();
    } catch (e) {
      const r = refusalOf(e);
      setError(r.message + (r.code === 'DEVICE_LIMIT' ? ' Remove an old phone on the website (Attendance → My Phones) or ask HR.' : ''));
      if (r.code === 'OFFICE_GEOFENCE' || r.code === 'WFH_GEOFENCE' || r.code === 'GPS_ACCURACY_LOW') setCheck((c) => (c ? { ...c, ok: false, canSendForApproval: true } : c));
    } finally {
      setBusy(null);
    }
  }

  async function onSitePhoto(uri: string, takenAt: Date) {
    setCamera(null);
    try {
      setSitePhoto(await preparePhoto(uri, takenAt, false));
    } catch (e) {
      setError(refusalOf(e).message);
    }
  }

  async function startSelfie() {
    setError(null);
    try {
      await ensureRegistered(userId); // registers this phone the first time (needs network once)
      setCamera('selfie');
    } catch (e) {
      const r = refusalOf(e);
      setError(r.message + (r.code === 'DEVICE_LIMIT' ? ' Remove an old phone on the website (Attendance → My Phones) or ask HR.' : ''));
    }
  }

  const t = status.today;
  return (
    <>
      <Queue userId={userId} items={queue} onChanged={refreshQueue} />
      {status.next === 'RESOLVE_PREVIOUS' && status.unresolvedDate ? <MissedPunchOut date={status.unresolvedDate} onDone={refreshAll} /> : null}
      <Card>
        <Text style={text.muted}>Today · {formatDate(status.date)}</Text>
        {t ? (
          <>
            <Row label="Mode" value={t.punchMode ? MODE_LABEL[t.punchMode] : '—'} />
            <Row label="Punch in" value={`${time(t.punchInAt)}${t.lateMinutes ? ` (late ${t.lateMinutes} min)` : ''}`} />
            <Row label="Punch out" value={time(t.punchOutAt)} />
            <Row label="Worked" value={hm(t.workedMinutes ?? (t.punchInAt && !t.punchOutAt ? Math.round((Date.now() - new Date(t.punchInAt).getTime()) / 60_000) : null))} />
            <Row label="Status" value={<Text style={{ color: t.verificationStatus ? V_TONE[t.verificationStatus] : colors.text, fontWeight: '700' }}>{t.status.replace('_', ' ')}{t.verificationStatus ? ` · ${V_LABEL[t.verificationStatus]}` : ''}</Text>} />
          </>
        ) : (
          <Text style={styles.big}>{status.holiday ? `Holiday — ${status.holiday}` : status.workingDay ? 'Not punched in' : 'Weekly off'}</Text>
        )}
        <Text style={[text.muted, styles.gap]}>Late after {status.policy.cutoff} · half day if you leave before {status.policy.halfDayBefore}</Text>

        {done ? <Text style={styles.ok}>{done}</Text> : null}
        {error ? <ErrorBox message={error} /> : null}

        {status.next === 'PUNCH_IN' || status.next === 'PUNCH_OUT' ? (
          <View style={styles.gap}>
            {type === 'IN' ? (
              <ChipSelect
                label="Attendance mode"
                value={modeChoice}
                options={allowed.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
                onChange={(v) => {
                  if (!v) return;
                  setModeChoice(v);
                  setCheck(null);
                  setFix(null);
                }}
              />
            ) : (
              <Text style={text.muted}>Punching out of {MODE_LABEL[mode]}</Text>
            )}
            {wfhBlocked ? <WfhRequest pending={status.wfhLocation?.status === 'PENDING'} onDone={refreshAll} /> : null}
            {type === 'IN' && mode === 'TOUR' && status.tours.length === 0 ? <Text style={styles.warn}>No approved tour today — request one on the website (Attendance → WFH &amp; Tours); an emergency tour can be used while it waits for approval.</Text> : null}
            {type === 'IN' && mode === 'FIELD_GENERAL' ? (
              <>
                <Field label="Purpose of the visit" value={purpose} onChangeText={setPurpose} maxLength={300} />
                <Field label="Place" value={place} onChangeText={setPlace} maxLength={300} />
              </>
            ) : null}
            {type === 'IN' && mode === 'FIELD_CUSTOMER' ? (
              <>
                {openTickets.length > 0 ? (
                  <ChipSelect
                    label="Service ticket (optional)"
                    value={ticketId}
                    allowClear
                    options={openTickets.map((t) => ({ value: t.id, label: `${t.ticketNo} · ${t.customer.name}` }))}
                    onChange={(v) => setTicketId(v)}
                  />
                ) : null}
                {!ticketId ? <CustomerPicker value={customer} onChange={setCustomer} /> : null}
                <Field label="Purpose of the visit" value={purpose} onChangeText={setPurpose} maxLength={300} />
              </>
            ) : null}
            {type === 'OUT' && mode === 'FIELD_CUSTOMER' ? (
              <>
                <Field label="Meeting notes" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
                <Field label="Outcome" value={outcome} onChangeText={setOutcome} maxLength={300} />
                <Button title={sitePhoto ? 'Site photo taken ✓ (retake)' : 'Add a site photo (optional)'} variant="secondary" onPress={() => setCamera('site')} />
              </>
            ) : null}

            {!wfhBlocked ? (
              <>
                <Button title={fix ? 'Check location again' : 'Check my location'} variant="secondary" loading={busy === 'location'} disabled={busy !== null} onPress={() => void checkLocation()} />
                {fix ? (
                  <Text style={[styles.gap, check && !check.ok ? styles.warn : styles.ok]}>
                    Accuracy ±{fix.accuracy === null ? '?' : Math.round(fix.accuracy)} m
                    {check?.distanceM !== null && check?.distanceM !== undefined ? ` · ${check.distanceM} m from the approved place${check.radiusM ? ` (limit ${check.radiusM} m)` : ''}` : ''}
                    {offlineCheck ? ' · no network — the punch will be saved and sent later' : ''}
                  </Text>
                ) : null}
                {fix ? (
                  // Shown so HR, standing in the office, can register this router (Attendance → Work Sites → Office Wi-Fi).
                  <Text style={text.muted}>{fix.wifiBssid ? `Wi-Fi: ${fix.wifiName ?? 'connected'} · ${fix.wifiBssid}` : 'Wi-Fi: not connected'}</Text>
                ) : null}
                {check?.checks
                  .filter((c) => c.result !== 'PASS')
                  .map((c, i) => (
                    <Text key={`${c.code}-${i}`} style={c.result === 'FAIL' ? styles.bad : styles.warn}>
                      • {c.detail}
                    </Text>
                  ))}
                {needsReason ? <Field label="Reason (this punch goes to your manager for approval)" value={reason} onChangeText={setReason} maxLength={1000} /> : null}
                <View style={styles.gap}>
                  <Button
                    title={type === 'IN' ? (needsReason ? 'Selfie & send punch-in for approval' : 'Take selfie & PUNCH IN') : needsReason ? 'Selfie & send punch-out for approval' : 'Take selfie & PUNCH OUT'}
                    loading={busy === 'send'}
                    disabled={busy !== null || !fix || blocked || !fieldReady || (needsReason && reason.trim().length < 5)}
                    onPress={() => void startSelfie()}
                  />
                </View>
                {!fix ? <Text style={[text.muted, styles.hint]}>Check your location first, then take a live selfie.</Text> : null}
              </>
            ) : null}
          </View>
        ) : null}
        {status.next === 'DONE' ? <Text style={[text.muted, styles.gap]}>You have punched in and out today.</Text> : null}
      </Card>
      <SelfieCamera
        visible={camera !== null}
        facing={camera === 'site' ? 'back' : 'front'}
        title={camera === 'site' ? 'Site photo' : 'Live selfie — look at the camera'}
        onCancel={() => setCamera(null)}
        onTaken={(uri, at) => void (camera === 'site' ? onSitePhoto(uri, at) : onSelfie(uri, at))}
      />
      {status.activeDevices === 0 && status.consentAccepted ? (
        <Text style={[text.muted, styles.hint]}>This phone is registered for your attendance the first time you punch (you can have two phones).</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  big: { fontSize: 22, fontWeight: '800', marginVertical: space.sm, color: colors.text },
  gap: { marginTop: space.md },
  hint: { marginTop: space.sm, textAlign: 'center' },
  notice: { fontSize: 14, color: colors.text, marginBottom: space.sm, lineHeight: 20 },
  ok: { color: colors.success, fontSize: 14, marginTop: space.sm, fontWeight: '600' },
  warn: { color: colors.warning, fontSize: 13, marginTop: space.xs },
  bad: { color: colors.danger, fontSize: 13, marginTop: space.xs },
});
