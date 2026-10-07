import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, DateField, DateTimeField, Segmented } from '../components/inputs';
import { ReasonAction } from '../components/ReasonAction';
import { Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate, formatWhen, isoDay, nextHour } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

type ActionItemStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
interface ActionItem {
  id: string;
  meetingId: string;
  description: string;
  assignedToId: string;
  dueDate: string | null;
  status: ActionItemStatus;
  assignedTo?: { id: string; fullName: string };
  meeting?: { id: string; title: string; scheduledAt: string };
}
interface Meeting {
  id: string;
  title: string;
  agenda: string | null;
  scheduledAt: string;
  durationMinutes: number | null;
  location: string | null;
  meetingLink: string | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  minutes: string | null;
  cancelReason: string | null;
  organizer: { id: string; fullName: string };
  attendees: Array<{ userId: string; required: boolean; user: { id: string; fullName: string } }>;
  actionItems: ActionItem[];
}

const TONE: Record<string, string> = { SCHEDULED: colors.primaryDark, IN_PROGRESS: colors.warning, COMPLETED: colors.success, CANCELLED: colors.danger, OPEN: colors.warning, DONE: colors.success };
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const overdue = (i: ActionItem) => i.dueDate !== null && (i.status === 'OPEN' || i.status === 'IN_PROGRESS') && i.dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);

/** The buttons an assignee (or the organizer) has for an action item: start it, or mark it done. The server decides who may. */
function ActionItemCard({ item, showMeeting, onOpenMeeting }: { item: ActionItem; showMeeting?: boolean; onOpenMeeting?: () => void }) {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (status: ActionItemStatus) => api.post(`/meetings/${item.meetingId}/action-items/${item.id}/update`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meetings'] });
      void qc.invalidateQueries({ queryKey: ['action-items'] });
    },
    onError: (err) => setError(errorText(err, 'Could not update the action item.')),
  });
  const open = item.status === 'OPEN' || item.status === 'IN_PROGRESS';
  const mine = item.assignedToId === user?.id;
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text style={[styles.status, { color: overdue(item) ? colors.danger : (TONE[item.status] ?? colors.muted) }]}>{overdue(item) ? 'Overdue' : enumLabel(item.status)}</Text>
        <Text style={text.muted}>{item.dueDate ? `Due ${formatDate(item.dueDate)}` : 'No due date'}</Text>
      </View>
      <Text style={styles.name}>{item.description}</Text>
      {item.assignedTo ? <Text style={text.muted}>For {item.assignedTo.fullName}</Text> : null}
      {showMeeting && item.meeting ? (
        <Pressable onPress={onOpenMeeting} accessibilityRole="button">
          <Text style={styles.linkText}>Meeting: {item.meeting.title}</Text>
        </Pressable>
      ) : null}
      {error ? <ErrorBox message={error} /> : null}
      {open && mine && hasPermission('meeting.manage') ? (
        <View style={styles.actions}>
          {item.status === 'OPEN' ? (
            <View style={styles.flex}>
              <Button title="Start" variant="secondary" disabled={update.isPending} onPress={() => update.mutate('IN_PROGRESS')} />
            </View>
          ) : null}
          <View style={styles.flex}>
            <Button title="Mark Done" loading={update.isPending && update.variables === 'DONE'} disabled={update.isPending} onPress={() => update.mutate('DONE')} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Internal meetings I organise or attend, and the action items given to me. */
export function MeetingsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Meetings'>) {
  const { hasPermission } = useAuth();
  // Arranging a meeting needs the staff list to choose who attends.
  const canCreate = hasPermission('meeting.manage') && hasPermission('user.read');
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canCreate
        ? () => (
            <Pressable onPress={() => navigation.navigate('MeetingForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="New meeting">
              <Text style={styles.headerBtn}>+ New</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canCreate]);
  const [view, setView] = useState<'meetings' | 'actions'>('meetings');
  const meetings = useQuery({ queryKey: ['meetings', 'list'], queryFn: () => api.get<{ items: Meeting[]; total: number }>('/meetings', { pageSize: 50 }) });
  const actions = useQuery({ queryKey: ['action-items', 'mine'], queryFn: () => api.get<ActionItem[]>('/action-items/mine') });
  const openActions = (actions.data ?? []).filter((i) => i.status === 'OPEN' || i.status === 'IN_PROGRESS');
  const q = view === 'meetings' ? meetings : actions;

  return (
    <View style={styles.screen}>
      <View>
        <Segmented
          value={view}
          options={[
            { value: 'meetings' as const, label: 'Meetings' },
            { value: 'actions' as const, label: openActions.length > 0 ? `My Action Items (${openActions.length})` : 'My Action Items' },
          ]}
          onChange={setView}
        />
      </View>
      {q.isError ? <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load.')} /></View> : null}
      {view === 'meetings' ? (
        <FlatList
          data={meetings.data?.items ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={meetings.isRefetching} onRefresh={() => void meetings.refetch()} />}
          ListEmptyComponent={meetings.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No meetings" />}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('MeetingDetail', { id: item.id, title: item.title })} accessibilityRole="button">
              <View style={styles.row}>
                <Text style={text.muted}>{formatWhen(item.scheduledAt)}</Text>
                <Text style={[styles.status, { color: TONE[item.status] ?? colors.muted }]}>{enumLabel(item.status)}</Text>
              </View>
              <Text style={styles.name}>{item.title}</Text>
              <Text style={text.muted}>
                {item.organizer.fullName} · {item.attendees.length} attending{item.location ? ` · ${item.location}` : ''}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={actions.data ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={actions.isRefetching} onRefresh={() => void actions.refetch()} />}
          ListEmptyComponent={actions.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No action items for you" />}
          renderItem={({ item }) => <ActionItemCard item={item} showMeeting onOpenMeeting={() => item.meeting && navigation.navigate('MeetingDetail', { id: item.meeting.id, title: item.meeting.title })} />}
        />
      )}
    </View>
  );
}


/** What the organiser does with a meeting: start it, close it with the minutes, cancel it, and give out action items. The server allows the organiser only. */
function MeetingActions({ m }: { m: Meeting }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(m.minutes ?? '');
  const [closing, setClosing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState<Date | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['meetings'] });
    void qc.invalidateQueries({ queryKey: ['action-items'] });
  };
  const act = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) => api.post(`/meetings/${m.id}/${action}`, body),
    onSuccess: (_d, vars) => {
      refresh();
      setClosing(false);
      if (vars.action === 'action-items') {
        setAdding(false);
        setDescription('');
        setAssignee(null);
        setDue(null);
      }
    },
    onError: (err) => setError(errorText(err, 'Could not save.')),
  });
  const run = (action: string, body?: unknown) => {
    setError(null);
    act.mutate({ action, body });
  };
  const live = m.status === 'SCHEDULED' || m.status === 'IN_PROGRESS';
  // An action item goes to someone in the meeting: the organiser or an attendee.
  const people = [{ value: m.organizer.id, label: m.organizer.fullName }, ...m.attendees.filter((a) => a.userId !== m.organizer.id).map((a) => ({ value: a.userId, label: a.user.fullName }))];

  function addItem() {
    if (description.trim().length < 2) return setError('Write what has to be done.');
    if (!assignee) return setError('Choose who will do it.');
    run('action-items', { description: description.trim(), assignedToId: assignee, dueDate: due ? isoDay(due) : undefined });
  }

  return (
    <Card>
      <Text style={[text.h2, styles.section]}>Organiser</Text>
      {error ? <ErrorBox message={error} /> : null}
      {m.status === 'SCHEDULED' ? <Button title="Start Meeting" loading={act.isPending && act.variables?.action === 'start'} disabled={act.isPending} onPress={() => run('start')} /> : null}
      {live ? (
        closing ? (
          <View style={styles.gap}>
            <Field label="Minutes of the meeting" value={minutes} onChangeText={setMinutes} multiline />
            <Button title="Complete Meeting" loading={act.isPending && act.variables?.action === 'complete'} disabled={act.isPending} onPress={() => run('complete', { minutes: minutes.trim() || undefined })} />
            <View style={styles.gapSmall} />
            <Button title="Back" variant="secondary" onPress={() => setClosing(false)} />
          </View>
        ) : (
          <View style={styles.gap}>
            <Button title="Complete with Minutes" variant="secondary" disabled={act.isPending} onPress={() => setClosing(true)} />
          </View>
        )
      ) : null}
      {m.status !== 'CANCELLED' ? (
        adding ? (
          <View style={styles.gap}>
            <Field label="Action item — what has to be done *" value={description} onChangeText={setDescription} multiline />
            <ChipSelect label="Who will do it *" value={assignee} options={people} onChange={setAssignee} />
            <DateField label="Due date (optional)" value={due} onChange={setDue} minimumDate={new Date()} allowClear />
            <Button title="Add Action Item" loading={act.isPending && act.variables?.action === 'action-items'} disabled={act.isPending} onPress={addItem} />
            <View style={styles.gapSmall} />
            <Button title="Back" variant="secondary" onPress={() => setAdding(false)} />
          </View>
        ) : (
          <View style={styles.gap}>
            <Button title="+ Action Item" variant="secondary" disabled={act.isPending} onPress={() => setAdding(true)} />
          </View>
        )
      ) : null}
      {live ? (
        <View style={styles.gap}>
          <ReasonAction title="Cancel Meeting" label="Why is the meeting cancelled" confirmTitle="Cancel Meeting" danger busy={act.isPending && act.variables?.action === 'cancel'} disabled={act.isPending} onSubmit={(reason) => run('cancel', { reason })} />
        </View>
      ) : null}
    </Card>
  );
}

interface UserOption {
  id: string;
  fullName: string;
  status?: string;
}

/** Arrange an internal meeting: title, when, where, and who should attend (needs the permission to see the staff list). */
export function MeetingFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'MeetingForm'>) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users', 'for-meeting'], queryFn: () => api.get<UserOption[]>('/users') });
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [when, setWhen] = useState(nextHour);
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<Meeting>('/meetings', {
        title: title.trim(),
        agenda: agenda.trim() || undefined,
        scheduledAt: when.toISOString(),
        durationMinutes: duration.trim() ? Number(duration) : undefined,
        location: location.trim() || undefined,
        meetingLink: link.trim() || undefined,
        attendees: picked.map((userId) => ({ userId })),
      }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ['meetings'] });
      navigation.replace('MeetingDetail', { id: m.id, title: m.title });
    },
    onError: (err) => setError(errorText(err, 'Could not save the meeting.')),
  });

  function submit() {
    if (title.trim().length < 2) return setError('Enter the meeting title.');
    if (picked.length === 0) return setError('Choose at least one person to attend.');
    if (duration.trim() && !(Number.isInteger(Number(duration)) && Number(duration) > 0 && Number(duration) <= 1440)) return setError('Duration must be whole minutes (up to 1440).');
    setError(null);
    create.mutate();
  }

  const others = (users.data ?? []).filter((u) => u.id !== user?.id && (u.status === undefined || u.status === 'ACTIVE'));
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Title *" value={title} onChangeText={setTitle} maxLength={200} />
        <DateTimeField label="Date and time *" value={when} onChange={setWhen} minimumDate={new Date()} />
        <Field label="Duration (minutes)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <Field label="Place" value={location} onChangeText={setLocation} maxLength={300} />
        <Field label="Online meeting link" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} maxLength={500} />
        <Field label="Agenda" value={agenda} onChangeText={setAgenda} multiline />
      </Card>
      <Card>
        <Text style={[text.h2, styles.section]}>Who should attend * ({picked.length})</Text>
        {users.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {users.isError ? <ErrorBox message={errorText(users.error, 'Could not load the staff list.')} /> : null}
        <View style={styles.chips}>
          {others.map((u) => {
            const on = picked.includes(u.id);
            return (
              <Pressable key={u.id} style={[styles.chip, on && styles.chipOn]} onPress={() => setPicked((p) => (on ? p.filter((x) => x !== u.id) : [...p, u.id]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{u.fullName}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Button title="Save Meeting" onPress={submit} loading={create.isPending} />
      <View style={styles.gap} />
    </ScrollView>
  );
}

export function MeetingDetailScreen({ route }: NativeStackScreenProps<MoreStackParams, 'MeetingDetail'>) {
  const { user, hasPermission } = useAuth();
  const q = useQuery({ queryKey: ['meetings', 'one', route.params.id], queryFn: () => api.get<Meeting>(`/meetings/${route.params.id}`) });
  const m = q.data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.pad} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this meeting.')} /> : null}
      {m ? (
        <>
          <Card>
            <View style={styles.row}>
              <Text style={[text.h1, styles.flex]}>{m.title}</Text>
              <Text style={[styles.status, { color: TONE[m.status] ?? colors.muted }]}>{enumLabel(m.status)}</Text>
            </View>
            <Row label="When" value={formatWhen(m.scheduledAt)} />
            <Row label="Duration" value={m.durationMinutes ? `${m.durationMinutes} minutes` : null} />
            <Row label="Place" value={m.location} />
            <Row label="Organiser" value={m.organizer.fullName} />
            <Row label="Attending" value={m.attendees.map((a) => `${a.user.fullName}${a.required ? '' : ' (optional)'}`).join(', ')} />
            <Row label="Cancelled because" value={m.cancelReason} />
            {m.meetingLink && /^https?:\/\//i.test(m.meetingLink) ? (
              <View style={styles.gap}>
                <Button title="Open Meeting Link" variant="secondary" onPress={() => void Linking.openURL(m.meetingLink!)} />
              </View>
            ) : null}
          </Card>
          {m.organizer.id === user?.id && hasPermission('meeting.manage') && m.status !== 'CANCELLED' ? <MeetingActions m={m} /> : null}
          {m.agenda ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Agenda</Text>
              <Text style={text.body}>{m.agenda}</Text>
            </Card>
          ) : null}
          {m.minutes ? (
            <Card>
              <Text style={[text.h2, styles.section]}>Minutes</Text>
              <Text style={text.body}>{m.minutes}</Text>
            </Card>
          ) : null}
          {m.actionItems.length > 0 ? <Text style={[text.h2, styles.section]}>Action items ({m.actionItems.length})</Text> : null}
          {m.actionItems.map((i) => (
            <ActionItemCard key={i.id} item={i} />
          ))}
          <Text style={[text.muted, styles.foot]}>The in-app video call is on the web CRM; an online meeting link opens from here.</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg },
  list: { padding: space.lg, flexGrow: 1 },
  flex: { flex: 1 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, marginVertical: 3 },
  status: { fontSize: 12, fontWeight: '700' },
  linkText: { fontSize: 13.5, fontWeight: '700', color: colors.primary, marginTop: space.xs },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  section: { marginBottom: space.sm },
  gap: { marginTop: space.md },
  gapSmall: { height: space.sm },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13.5, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  foot: { textAlign: 'center', marginVertical: space.lg },
});
