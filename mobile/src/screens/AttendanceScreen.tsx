import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChipSelect } from '../components/inputs';
import { Button, Card, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import { getPunchLocation, startFieldTracking, stopFieldTracking, type PunchLocation } from '../lib/location';
import { colors, space } from '../theme';
import { useVerifiedStatus, VerifiedPunchCard } from './VerifiedPunchCard';

interface Today {
  date: string;
  workingDay: boolean;
  holiday: { name: string } | null;
  record: { status: string; punchInAt: string | null; punchOutAt: string | null; punchInLat?: string | null; punchInLng?: string | null } | null;
  status: string;
  canMark: boolean;
  cutoff: string;
  /** What marking right now would record: PRESENT, or LATE once the cutoff has passed. */
  willBe: string | null;
  punchOutEnabled: boolean;
}
interface Day {
  date: string;
  status: string;
  punchInAt: string | null;
  holiday: string | null;
}

const KINDS = [
  { value: 'WFO', label: 'At Office' },
  { value: 'OD', label: 'Field / On Duty' },
  { value: 'WFH', label: 'Work From Home' },
];
const TONE: Record<string, string> = { PRESENT: colors.success, WFH: colors.success, OD: colors.success, LATE: colors.warning, ABSENT: colors.danger, LEAVE: colors.primaryDark, HOLIDAY: colors.muted, WEEKLY_OFF: colors.muted, NOT_MARKED: colors.warning };
const LABEL: Record<string, string> = { OD: 'Field / On Duty', WFH: 'Work From Home', NOT_MARKED: 'Not Marked', WEEKLY_OFF: 'Weekly Off' };
const label = (s: string) => LABEL[s] ?? enumLabel(s);
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
/** "Today's Summary" work duration: punch-in to punch-out, or punch-in to now while still clocked in (as of the last refresh — not a live ticking clock). */
const duration = (fromIso: string, toIso: string | null) => {
  const mins = Math.max(0, Math.round(((toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
/** The server (before it learned about location) refuses unknown fields with this wording. */
const rejectsLocation = (err: unknown) => err instanceof ApiError && err.status === 400 && /latitude|longitude|accuracy/i.test(err.message) && /should not exist/i.test(err.message);

/**
 * Mark attendance for today — with the phone's location — and see this month. The server decides Present / Late from its
 * own clock and cutoff; the app only sends where the phone is. Leave has its own screen; corrections are the in-charge's.
 */
export function AttendanceScreen() {
  const qc = useQueryClient();
  const today = useQuery({ queryKey: ['attendance', 'today'], queryFn: () => api.get<Today>('/attendance/today') });
  const month = useQuery({ queryKey: ['attendance', 'month'], queryFn: () => api.get<Day[]>('/attendance/month') });
  const [kind, setKind] = useState('WFO');
  // The work modes the attendance in-charge keeps on the web (an older server has no list: the three kinds above are used).
  const modes = useQuery({ queryKey: ['attendance', 'work-modes'], queryFn: () => api.get<Array<{ id: string; name: string; kind: string }>>('/attendance/work-modes'), retry: false, staleTime: 5 * 60_000 });
  const [modeId, setModeId] = useState<string | null>(null);
  const modeList = modes.data && modes.data.length > 0 ? modes.data : null;
  const mode = modeList ? (modeList.find((m) => m.id === modeId) ?? modeList.find((m) => m.kind === 'WFO') ?? modeList[0]!) : null;
  const office = mode ? mode.kind === 'WFO' : kind === 'WFO';
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const t = today.data;
  // Verified attendance (location + live selfie + registered phone), when HR has switched it on: it replaces the simple
  // Mark Attendance below. An older server without it answers 404 and the screen stays as before.
  const verifiedStatus = useVerifiedStatus();
  const verified = verifiedStatus.data && verifiedStatus.data.verificationMode !== 'OFF' ? verifiedStatus.data : null;
  const trackingAllowed = verifiedStatus.data?.switches.backgroundTracking !== false;

  // Safety net for a punch-in that happened in an earlier app session (e.g. the phone restarted): resumes the
  // background trail rather than leaving the rest of the day untracked. A no-op if it is already running. Never when HR
  // has switched background tracking off for this employee.
  useEffect(() => {
    if (!verified && trackingAllowed && t?.record?.punchInAt && !t.record.punchOutAt) void startFieldTracking();
  }, [verified, trackingAllowed, t?.record?.punchInAt, t?.record?.punchOutAt]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['attendance'] });
  };

  /** Sends the request with the location; if this server does not accept location yet, sends it again without. */
  async function send(path: string, body: Record<string, unknown>, location: PunchLocation | null) {
    if (!location) return api.post(path, body);
    try {
      return await api.post(path, { ...body, ...location });
    } catch (err) {
      if (!rejectsLocation(err)) throw err;
      setNote('Saved, but the server is not yet updated to store location — only the time was recorded.');
      return api.post(path, body);
    }
  }

  async function withLocation(action: string, run: (location: PunchLocation | null) => Promise<unknown>) {
    setError(null);
    setNote(null);
    setBusy(action);
    try {
      const found = await getPunchLocation();
      if (!found.ok) {
        setBusy(null);
        Alert.alert('Location not available', `${found.reason} Continue without location?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              setBusy(action);
              run(null)
                .then(refresh)
                .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not save.'))
                .finally(() => setBusy(null));
            },
          },
        ]);
        return;
      }
      await run(found.location);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  }

  const mark = () =>
    withLocation('mark', async (location) => {
      const result = await send('/attendance/mark', { ...(mode ? { workModeId: mode.id } : { kind }), remarks: remarks.trim() || undefined }, location);
      if (trackingAllowed) await startFieldTracking();
      return result;
    });
  const punchOut = () =>
    withLocation('out', async (location) => {
      const result = await send('/attendance/punch-out', {}, location);
      await stopFieldTracking();
      return result;
    });

  const days = (month.data ?? []).filter((d) => d.date <= (t?.date ?? '9999')).reverse();
  const count = (s: string) => days.filter((d) => d.status === s).length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={today.isRefetching || month.isRefetching}
          onRefresh={() => {
            void today.refetch();
            void month.refetch();
            void verifiedStatus.refetch();
          }}
        />
      }
    >
      {today.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {today.isError ? <ErrorBox message={today.error instanceof ApiError ? today.error.message : 'Could not load attendance.'} /> : null}
      {error ? <ErrorBox message={error} /> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}

      {verified ? <VerifiedPunchCard status={verified} onChanged={() => void verifiedStatus.refetch()} /> : null}

      {t && !verified ? (
        <Card>
          <Text style={text.muted}>Today · {formatDate(t.date)}</Text>
          <Text style={[styles.big, { color: TONE[t.status] ?? colors.text }]}>{label(t.status)}</Text>
          {t.holiday ? <Text style={text.muted}>{t.holiday.name}</Text> : null}
          {t.record?.punchInAt ? <Row label="Marked at" value={time(t.record.punchInAt)} /> : null}
          {t.record?.punchInAt && t.record.punchInLat && t.record.punchInLng ? (
            <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${t.record!.punchInLat},${t.record!.punchInLng}`)} accessibilityRole="button" accessibilityLabel="View your punch-in location on the map">
              <Row label="Location" value="Saved · View on map" />
            </Pressable>
          ) : t.record?.punchInAt ? (
            <Row label="Location" value="Not recorded" />
          ) : null}
          {t.record?.punchOutAt ? <Row label="Punched out" value={time(t.record.punchOutAt)} /> : null}
          {t.record?.punchInAt ? <Row label="Work duration" value={duration(t.record.punchInAt, t.record.punchOutAt)} /> : null}

          {t.canMark ? (
            <View style={styles.gap}>
              {modeList && mode ? (
                <ChipSelect label="Work mode" value={mode.id} options={modeList.map((m) => ({ value: m.id, label: m.name }))} onChange={(v) => v && setModeId(v)} />
              ) : (
                <ChipSelect label="I am working from" value={kind} options={KINDS} onChange={(v) => v && setKind(v)} />
              )}
              {office && t.willBe === 'LATE' ? <Text style={styles.late}>The cutoff ({t.cutoff}) has passed — this will be recorded as Late.</Text> : null}
              <Field label="Remarks (optional)" value={remarks} onChangeText={setRemarks} maxLength={500} />
              <Button title="Mark Attendance" loading={busy === 'mark'} disabled={busy !== null} onPress={() => void mark()} />
              <Text style={[text.muted, styles.hint]}>Your location is saved with the attendance.</Text>
            </View>
          ) : null}
          {!t.canMark && !t.record && !t.workingDay ? <Text style={[text.muted, styles.gap]}>Today is not a working day.</Text> : null}
          {t.punchOutEnabled && t.record?.punchInAt && !t.record.punchOutAt ? (
            <View style={styles.gap}>
              <Button title="Punch Out" variant="secondary" loading={busy === 'out'} disabled={busy !== null} onPress={() => void punchOut()} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {days.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.section]}>This month</Text>
          <View style={styles.counts}>
            <Text style={styles.count}>Present {count('PRESENT') + count('WFH') + count('OD')}</Text>
            <Text style={[styles.count, { color: colors.warning }]}>Late {count('LATE')}</Text>
            <Text style={[styles.count, { color: colors.danger }]}>Absent {count('ABSENT')}</Text>
            <Text style={styles.count}>Leave {count('LEAVE')}</Text>
          </View>
          {days.map((d) => (
            <View key={d.date} style={styles.day}>
              <Text style={[text.body, styles.flex]}>{formatDate(d.date)}</Text>
              {d.punchInAt ? <Text style={text.muted}>{time(d.punchInAt)}</Text> : null}
              <Text style={[styles.dayStatus, { color: TONE[d.status] ?? colors.muted }]}>{d.holiday ?? label(d.status)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      <Text style={[text.muted, styles.foot]}>For leave, use More → Leave. A wrong entry is corrected by the attendance in-charge (More → Team Attendance).</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  big: { fontSize: 26, fontWeight: '800', marginTop: 2, marginBottom: space.sm },
  gap: { marginTop: space.md },
  hint: { marginTop: space.sm, textAlign: 'center' },
  late: { color: colors.warning, fontSize: 13, marginBottom: space.md },
  note: { color: colors.warning, fontSize: 13, marginBottom: space.md },
  section: { marginBottom: space.sm },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.sm },
  count: { fontSize: 13, fontWeight: '700', color: colors.text },
  day: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dayStatus: { fontSize: 13, fontWeight: '700', minWidth: 96, textAlign: 'right' },
  foot: { textAlign: 'center', marginBottom: space.lg },
});
