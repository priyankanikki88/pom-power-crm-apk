import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChipSelect, DateField } from '../components/inputs';
import { Button, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { isoDay } from '../lib/dates';
import { enumLabel } from '../lib/format';
import { colors, radius, space } from '../theme';

interface BoardRow {
  user: { id: string; fullName: string; branch: string | null };
  status: string;
  record: { status: string; punchInAt: string | null; remarks: string | null; punchInLat?: string | null; punchInLng?: string | null } | null;
  holiday: string | null;
}
interface Board {
  date: string;
  workingDay: boolean;
  items: BoardRow[];
  counts: Record<string, number>;
}

const STATUSES = (['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE', 'WFH', 'OD', 'HOLIDAY'] as const).map((value) => ({ value, label: value === 'WFH' ? 'Work From Home' : value === 'OD' ? 'On Duty' : enumLabel(value) }));
const TONE: Record<string, string> = { PRESENT: colors.success, WFH: colors.success, OD: colors.success, LATE: colors.warning, ABSENT: colors.danger, LEAVE: colors.primaryDark, HALF_DAY: colors.primaryDark, HOLIDAY: colors.muted, WEEKLY_OFF: colors.muted, NOT_MARKED: colors.warning };
const label = (s: string) => (s === 'NOT_MARKED' ? 'Not Marked' : s === 'WFH' ? 'Work From Home' : s === 'OD' ? 'On Duty' : enumLabel(s));
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * For the attendance in-charge: everyone's attendance on a day, and setting or correcting one employee's entry. Changing
 * an entry that already exists needs a reason — it is kept with the correction.
 */
export function AttendanceBoardScreen() {
  const qc = useQueryClient();
  const [date, setDate] = useState<Date>(() => new Date());
  const day = isoDay(date);
  const q = useQuery({ queryKey: ['attendance', 'board', day], queryFn: () => api.get<Board>('/attendance/board', { date: day }) });
  const [editing, setEditing] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('PRESENT');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (row: BoardRow) => api.post('/attendance/set', { userId: row.user.id, date: day, status, ...(reason.trim() ? { reason: reason.trim(), remarks: reason.trim() } : {}) }),
    onSuccess: () => {
      setEditing(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save.'),
  });

  function open(row: BoardRow) {
    setError(null);
    setReason('');
    setStatus(row.record?.status ?? 'PRESENT');
    setEditing(editing === row.user.id ? null : row.user.id);
  }
  function submit(row: BoardRow) {
    if (row.record && reason.trim().length < 3) return setError('Write the reason for changing this entry.');
    setError(null);
    save.mutate(row);
  }

  const counts = q.data?.counts ?? {};
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <DateField label="Date" value={date} maximumDate={new Date()} onChange={(d) => d && setDate(d)} />
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={{ padding: space.xl }} /> : null}
      {q.isError ? <ErrorBox message={q.error instanceof ApiError ? q.error.message : 'Could not load the attendance board.'} /> : null}
      {q.data ? (
        <Text style={[text.muted, styles.counts]}>
          {q.data.workingDay ? '' : 'Not a working day · '}
          {Object.keys(counts)
            .map((k) => `${label(k)} ${counts[k]}`)
            .join(' · ')}
        </Text>
      ) : null}
      {q.data?.items.map((row) => (
        <View key={row.user.id} style={styles.item}>
          <Pressable style={styles.row} onPress={() => open(row)} accessibilityRole="button" accessibilityLabel={`${row.user.fullName}, ${label(row.status)}. Tap to set`}>
            <View style={styles.flex}>
              <Text style={styles.name}>{row.user.fullName}</Text>
              <Text style={text.muted}>
                {row.user.branch ?? 'No branch'}
                {row.record?.punchInAt ? ` · ${time(row.record.punchInAt)}` : ''}
                {row.holiday ? ` · ${row.holiday}` : ''}
              </Text>
            </View>
            <Text style={[styles.status, { color: TONE[row.status] ?? colors.muted }]}>{label(row.status)}</Text>
          </Pressable>
          {row.record?.punchInLat && row.record?.punchInLng ? (
            <Pressable
              style={styles.mapLink}
              onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${row.record!.punchInLat},${row.record!.punchInLng}`)}
              accessibilityRole="button"
              accessibilityLabel={`View ${row.user.fullName}'s punch-in location on the map`}
            >
              <Text style={styles.mapLinkText}>📍 View punch-in location on map</Text>
            </Pressable>
          ) : null}
          {editing === row.user.id ? (
            <View style={styles.form}>
              {error ? <ErrorBox message={error} /> : null}
              <ChipSelect label="Set as" value={status} options={STATUSES} onChange={(v) => v && setStatus(v)} />
              <Field label={row.record ? 'Reason for the change *' : 'Remarks (optional)'} value={reason} onChangeText={setReason} maxLength={500} />
              <Button title="Save" loading={save.isPending} onPress={() => submit(row)} />
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg },
  flex: { flex: 1 },
  counts: { marginBottom: space.md },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  status: { fontSize: 12.5, fontWeight: '700' },
  mapLink: { marginTop: space.sm },
  mapLinkText: { fontSize: 12.5, fontWeight: '600', color: colors.primaryDark },
  form: { marginTop: space.md },
});
