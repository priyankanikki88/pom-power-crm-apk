import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Empty, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError, authHeaders } from '../lib/api';
import { formatDate } from '../lib/dates';
import { API_BASE } from '../config';
import { colors, radius, space } from '../theme';

interface Check {
  code: string;
  result: string;
  detail: string;
}
interface PunchInfo {
  id: string;
  type: 'IN' | 'OUT';
  mode: string;
  channel: string;
  serverAt: string;
  deviceCapturedAt: string | null;
  verification: string;
  latitude: string;
  longitude: string;
  accuracyM: number | null;
  distanceM: number | null;
  mocked: boolean | null;
  selfieId: string;
  checksJson: Check[];
}
interface ExceptionItem {
  id: string;
  type: string;
  date: string;
  reason: string;
  requestedMode: string | null;
  requestedInAt: string | null;
  requestedOutAt: string | null;
  user: { fullName: string; employeeCode: string | null; branch?: { name: string } | null };
  punch: PunchInfo | null;
}
interface WfhItem {
  id: string;
  address: string;
  latitude: string;
  longitude: string;
  accuracyM: number | null;
  radiusM: number;
  user: { fullName: string };
}
interface TourItem {
  id: string;
  tourNo: string;
  destination: string;
  purpose: string;
  startDate: string;
  endDate: string;
  emergency: boolean;
  user: { fullName: string };
}
interface Approvals {
  exceptions: ExceptionItem[];
  wfhLocations: WfhItem[];
  tours: TourItem[];
}

const TYPE_LABEL: Record<string, string> = {
  OUTSIDE_GEOFENCE: 'Outside the approved place',
  POOR_GPS_ACCURACY: 'Poor GPS accuracy',
  GPS_UNAVAILABLE: 'GPS not available',
  CAMERA_FAILURE: 'Camera not working',
  DEVICE_REPLACEMENT: 'New phone',
  MISSED_PUNCH: 'Missed punch-out',
  WFH_LOCATION_ISSUE: 'WFH location issue',
  EMERGENCY_FIELD: 'Emergency field / tour',
  OFFLINE_ATTENDANCE: 'Marked offline',
  RISK_SIGNAL: 'Needs review',
  OTHER: 'Other',
};
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—');
const map = (lat: string, lng: string) => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);

/** Approve or reject with remarks (a rejection needs them). */
function Decide({ path, extra, onDone }: { path: string; extra?: Record<string, unknown>; onDone: () => void }) {
  const [remarks, setRemarks] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => api.post(path, { decision, remarks: remarks.trim() || undefined, ...extra }),
    onSuccess: onDone,
  });
  return (
    <View style={styles.gap}>
      <Field label="Remarks (needed to reject)" value={remarks} onChangeText={setRemarks} maxLength={1000} />
      {decide.isError ? <ErrorBox message={decide.error instanceof ApiError ? decide.error.message : 'Could not save the decision.'} /> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title="Approve" loading={decide.isPending && decide.variables === 'APPROVED'} disabled={decide.isPending} onPress={() => decide.mutate('APPROVED')} />
        </View>
        <View style={styles.flex}>
          <Button title="Reject" variant="danger" loading={decide.isPending && decide.variables === 'REJECTED'} disabled={decide.isPending || remarks.trim().length < 2} onPress={() => decide.mutate('REJECTED')} />
        </View>
      </View>
    </View>
  );
}

/** The selfie, loaded only when the approver asks (every view is logged on the server). */
function Selfie({ id }: { id: string }) {
  const [show, setShow] = useState(false);
  if (!show)
    return (
      <Pressable onPress={() => setShow(true)} accessibilityRole="button">
        <Text style={styles.link}>Show selfie</Text>
      </Pressable>
    );
  return <Image source={{ uri: `${API_BASE}/attendance/evidence/${id}`, headers: authHeaders() }} style={styles.photo} resizeMode="cover" accessibilityLabel="Punch selfie" />;
}

/**
 * Attendance approvals on the phone, for managers (their team) and HR (everyone): punches the server could not verify,
 * requests (missed punch-out, no GPS, camera …), home locations and tours. Same rules as the website — never one's own.
 */
export function AttendanceApprovalsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['attendance', 'approvals'], queryFn: () => api.get<Approvals>('/attendance/approvals') });
  const done = () => void qc.invalidateQueries({ queryKey: ['attendance'] });
  const d = q.data;
  const total = d ? d.exceptions.length + d.wfhLocations.length + d.tours.length : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={q.error instanceof ApiError ? q.error.message : 'Could not load approvals.'} /> : null}
      {d && total === 0 ? <Empty title="Nothing is waiting for you" hint="Attendance requests from your team appear here." /> : null}

      {d?.exceptions.map((e) => (
        <Card key={`e${e.id}`}>
          <Text style={text.h2}>{e.user.fullName}</Text>
          <Text style={text.muted}>
            {formatDate(e.date)}
            {e.user.branch?.name ? ` · ${e.user.branch.name}` : ''}
          </Text>
          <Text style={styles.tag}>{TYPE_LABEL[e.type] ?? e.type}</Text>
          <Text style={text.body}>{e.reason}</Text>
          {e.punch ? (
            <View style={styles.gap}>
              <Text style={text.muted}>
                Punch {e.punch.type === 'IN' ? 'in' : 'out'} {time(e.punch.deviceCapturedAt ?? e.punch.serverAt)} · {e.punch.channel === 'WEB' ? 'web' : e.punch.channel === 'MOBILE_OFFLINE' ? 'app, offline' : 'app'}
                {e.punch.distanceM !== null ? ` · ${e.punch.distanceM} m away` : ''} · ±{e.punch.accuracyM ?? '?'} m{e.punch.mocked ? ' · mock location!' : ''}
              </Text>
              {e.punch.checksJson
                .filter((c) => c.result !== 'PASS')
                .map((c, i) => (
                  <Text key={`${c.code}-${i}`} style={c.result === 'FAIL' ? styles.bad : styles.warn}>
                    • {c.detail}
                  </Text>
                ))}
              <View style={styles.row}>
                <Pressable onPress={() => map(e.punch!.latitude, e.punch!.longitude)} accessibilityRole="link">
                  <Text style={styles.link}>Map</Text>
                </Pressable>
                <Selfie id={e.punch.selfieId} />
              </View>
            </View>
          ) : (
            <Text style={text.muted}>
              Asks for: {[e.requestedMode, e.requestedInAt && `in ${time(e.requestedInAt)}`, e.requestedOutAt && `out ${time(e.requestedOutAt)}`].filter(Boolean).join(' · ')}
            </Text>
          )}
          <Decide path={`/attendance/exceptions/${e.id}/decide`} onDone={done} />
        </Card>
      ))}

      {d?.wfhLocations.map((w) => (
        <Card key={`w${w.id}`}>
          <Text style={text.h2}>{w.user.fullName}</Text>
          <Text style={styles.tag}>Work From Home location</Text>
          <Text style={text.body}>{w.address}</Text>
          <Pressable onPress={() => map(w.latitude, w.longitude)} accessibilityRole="link">
            <Text style={styles.link}>Map · ±{w.accuracyM ?? '?'} m · fence {w.radiusM} m</Text>
          </Pressable>
          <Decide path={`/attendance/wfh-locations/${w.id}/decide`} onDone={done} />
        </Card>
      ))}

      {d?.tours.map((t) => (
        <Card key={`t${t.id}`}>
          <Text style={text.h2}>{t.user.fullName}</Text>
          <Text style={styles.tag}>
            Official tour {t.tourNo}
            {t.emergency ? ' · emergency' : ''}
          </Text>
          <Text style={text.body}>
            {t.destination} · {formatDate(t.startDate.slice(0, 10))} – {formatDate(t.endDate.slice(0, 10))}
          </Text>
          <Text style={text.muted}>{t.purpose}</Text>
          <Decide path={`/attendance/official-tours/${t.id}/decide`} onDone={done} />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  gap: { marginTop: space.md },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center', marginTop: space.sm },
  flex: { flex: 1 },
  tag: { alignSelf: 'flex-start', backgroundColor: colors.warningSoft, color: colors.warning, fontSize: 12, fontWeight: '700', paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.md, marginVertical: space.sm },
  link: { color: colors.primary, fontWeight: '600' },
  warn: { color: colors.warning, fontSize: 13 },
  bad: { color: colors.danger, fontSize: 13 },
  photo: { width: 120, height: 160, borderRadius: radius.md, backgroundColor: colors.border },
});
