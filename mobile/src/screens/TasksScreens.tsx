import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, DateField, Segmented } from '../components/inputs';
import { ReasonAction } from '../components/ReasonAction';
import { Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dayFromIso, formatDate, isoDay } from '../lib/dates';
import { sendOrQueue } from '../lib/outbox';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type TaskAssignmentStatus = 'DIRECT' | 'PENDING_APPROVAL' | 'REJECTED';
export type TaskView = 'mine' | 'given' | 'approvals' | 'team' | 'all';

interface Named {
  id: string;
  name: string;
}
interface Task {
  id: string;
  title: string;
  description: string | null;
  assignedToId: string;
  createdBy: string | null;
  reference: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  originalDueDate: string | null;
  status: TaskStatus;
  remarks: string | null;
  subjectKind: 'PRODUCT' | 'SERVICE' | null;
  subjectName: string | null;
  assistanceNeeded: boolean;
  assistanceNote: string | null;
  assistanceReply: string | null;
  /** The assignee has asked for the deadline to move to this date (absent on an older server). */
  extensionRequestDate?: string | null;
  extensionRequestNote?: string | null;
  assignedTo: { id: string; fullName: string; department: Named | null };
  creator: { id: string; fullName: string } | null;
  assignmentStatus: TaskAssignmentStatus;
  assignmentApprover: { id: string; fullName: string } | null;
  department: Named | null;
  taskType: Named | null;
  assistBranch: Named | null;
  assistUser: { id: string; fullName: string } | null;
  extensions: Array<{ id: string; oldDueDate: string | null; newDueDate: string; reason: string }>;
}
interface Assignee {
  id: string;
  fullName: string;
  departmentId: string | null;
  designation: { name: string } | null;
}
interface Counts {
  open: number;
  overdue: number;
  management: boolean;
  pendingApprovals: number;
}

const STATUS_LABEL: Record<TaskStatus, string> = { OPEN: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done', CANCELLED: 'Cancelled' };
const STATUS_TONE: Record<TaskStatus, string> = { OPEN: colors.warning, IN_PROGRESS: colors.primary, DONE: colors.success, CANCELLED: colors.muted };
const PRIORITIES = (['LOW', 'MEDIUM', 'HIGH'] as const).map((value) => ({ value, label: value === 'LOW' ? 'Low' : value === 'MEDIUM' ? 'Medium' : 'High' }));
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const isOpen = (t: Task) => t.status === 'OPEN' || t.status === 'IN_PROGRESS';
const isOverdue = (t: Task) => isOpen(t) && t.dueDate !== null && t.dueDate.slice(0, 10) < isoDay(new Date());
const useCounts = () => useQuery({ queryKey: ['tasks', 'counts'], queryFn: () => api.get<Counts>('/tasks/counts') });
const useTasks = (view: TaskView) => useQuery({ queryKey: ['tasks', 'list', view], queryFn: () => api.get<Task[]>('/tasks', { view }) });

/**
 * Tasks: the ones given to me, the ones I gave, my team's and — for management (Director / MD / CEO) — everyone's.
 * Opening one shows its details and what may be done with it.
 */
export function TasksScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Tasks'>) {
  const { hasPermission } = useAuth();
  const counts = useCounts();
  const [view, setView] = useState<TaskView>('mine');
  const q = useTasks(view);
  const views: Array<{ value: TaskView; label: string }> = [
    { value: 'mine', label: counts.data && counts.data.open > 0 ? `Mine (${counts.data.open})` : 'Mine' },
    { value: 'given', label: 'Given' },
    ...(counts.data && counts.data.pendingApprovals > 0 ? [{ value: 'approvals' as const, label: `Approvals (${counts.data.pendingApprovals})` }] : []),
    ...(hasPermission('team.view') || counts.data?.management ? [{ value: 'team' as const, label: 'Team' }] : []),
    ...(counts.data?.management ? [{ value: 'all' as const, label: 'All' }] : []),
  ];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('TaskForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Give a task">
          <Text style={styles.headerBtn}>+ New</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <Segmented value={view} options={views} onChange={setView} />
      {view === 'mine' && counts.data && counts.data.overdue > 0 ? <Text style={styles.overdueBar}>{counts.data.overdue} of your tasks are past the deadline</Text> : null}
      {q.isError ? <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load the tasks.')} /></View> : null}
      <FlatList
        data={q.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
        ListEmptyComponent={q.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No tasks here" hint={view === 'mine' ? 'Nothing has been given to you yet.' : 'Tap + New to give a task.'} />}
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => navigation.navigate('TaskDetail', { id: item.id, view, title: item.title })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={2}>{item.title}</Text>
              <Text style={[styles.status, { color: STATUS_TONE[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
            </View>
            <Text style={text.muted}>{[view === 'mine' ? (item.creator ? `From ${item.creator.fullName}` : null) : item.assignedTo.fullName, item.taskType?.name, item.department?.name].filter(Boolean).join(' · ')}</Text>
            <Text style={[text.body, styles.line, isOverdue(item) ? styles.overdue : null]}>
              {item.dueDate ? `Deadline ${formatDate(item.dueDate)}${isOverdue(item) ? ' · overdue' : ''}` : 'No deadline'}
            </Text>
            {item.assistanceNeeded ? <Text style={styles.flag}>Assistance sought</Text> : null}
            {item.extensionRequestDate ? <Text style={styles.flag}>More time asked: {formatDate(item.extensionRequestDate)}</Text> : null}
            {item.assignmentStatus === 'PENDING_APPROVAL' ? <Text style={styles.flag}>Awaiting approval{item.assignmentApprover ? ` from ${item.assignmentApprover.fullName}` : ' (management)'}</Text> : null}
            {item.assignmentStatus === 'REJECTED' ? <Text style={[styles.flag, styles.overdue]}>Assignment not approved</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

/** One task: its details, the deadline history, and the actions open to this user. */
export function TaskDetailScreen({ route }: NativeStackScreenProps<MoreStackParams, 'TaskDetail'>) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const counts = useCounts();
  const q = useTasks(route.params.view);
  const t = q.data?.find((x) => x.id === route.params.id);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<'extend' | 'moretime' | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [reason, setReason] = useState('');

  const update = useMutation({
    mutationFn: (v: { label: string; body: Record<string, unknown> }) => sendOrQueue({ title: `${v.label}: ${t?.title ?? 'task'}`, method: 'PATCH', path: `/tasks/${route.params.id}`, body: v.body, refresh: ['tasks'] }),
    onSuccess: (res) => {
      setForm(null);
      setReason('');
      setDate(null);
      setNotice(res.queued ? 'No network — it is saved and will be sent when the phone is online.' : null);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => setError(errorText(err, 'Could not save the change.')),
  });
  const send = (label: string, body: Record<string, unknown>) => {
    setError(null);
    update.mutate({ label, body });
  };

  if (!t) return <View style={styles.screen}>{q.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="This task is not in the list any more" hint="Go back and refresh the list." />}</View>;

  const mine = t.assignedToId === user?.id;
  const owner = t.createdBy === user?.id || counts.data?.management === true;
  const isApprover = t.assignmentStatus === 'PENDING_APPROVAL' && (t.assignmentApprover ? t.assignmentApprover.id === user?.id : counts.data?.management === true);
  const dueDay = t.dueDate ? dayFromIso(t.dueDate) : null;
  const dayAfterDue = dueDay ? new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate() + 1) : undefined;

  function saveDate() {
    if (!date) return setError('Choose the new date.');
    if (reason.trim().length < 3) return setError(form === 'moretime' ? 'Write why more time is needed.' : 'Write the reason for the new deadline.');
    if (form === 'moretime') return send('Ask more time', { extensionRequestDate: isoDay(date), extensionRequestNote: reason.trim() });
    send('New deadline', { dueDate: isoDay(date), extensionReason: reason.trim() });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      {error ? <ErrorBox message={error} /> : null}
      {notice ? <Text style={[text.muted, styles.notice]}>{notice}</Text> : null}
      <Card>
        <Text style={text.h2}>{t.title}</Text>
        {t.description ? <Text style={[text.body, styles.line]}>{t.description}</Text> : null}
        <View style={styles.gap} />
        <Row label="Status" value={STATUS_LABEL[t.status]} />
        {t.assignmentStatus === 'PENDING_APPROVAL' ? <Text style={styles.flag}>Awaiting approval{t.assignmentApprover ? ` from ${t.assignmentApprover.fullName}` : ' (management)'}</Text> : null}
        {t.assignmentStatus === 'REJECTED' ? <Text style={[styles.flag, styles.overdue]}>Assignment not approved</Text> : null}
        <Row label="Deadline" value={t.dueDate ? `${formatDate(t.dueDate)}${isOverdue(t) ? ' (overdue)' : ''}` : 'None'} />
        {t.originalDueDate && t.dueDate && t.originalDueDate.slice(0, 10) !== t.dueDate.slice(0, 10) ? <Row label="First deadline" value={formatDate(t.originalDueDate)} /> : null}
        <Row label="Given to" value={t.assignedTo.fullName} />
        {t.creator ? <Row label="Given by" value={t.creator.fullName} /> : null}
        {t.department ? <Row label="Department" value={t.department.name} /> : null}
        {t.taskType ? <Row label="Task type" value={t.taskType.name} /> : null}
        {t.subjectName ? <Row label={t.subjectKind === 'SERVICE' ? 'Service' : 'Product'} value={t.subjectName} /> : null}
        {t.assistUser ? <Row label="Assistant employee" value={t.assistUser.fullName} /> : null}
        {t.assistBranch ? <Row label="Assistant branch" value={t.assistBranch.name} /> : null}
        {t.reference ? <Row label="Reference" value={t.reference} /> : null}
        <Row label="Priority" value={PRIORITIES.find((p) => p.value === t.priority)?.label ?? t.priority} />
        {t.remarks ? <Text style={[text.muted, styles.line]}>Remarks: {t.remarks}</Text> : null}
      </Card>

      {t.extensions.length > 0 ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Deadline extended</Text>
          {t.extensions.map((e) => (
            <Text key={e.id} style={[text.body, styles.line]}>
              {e.oldDueDate ? formatDate(e.oldDueDate) : 'No date'} → {formatDate(e.newDueDate)} — {e.reason}
            </Text>
          ))}
        </Card>
      ) : null}

      {t.assistanceNeeded || t.assistanceReply ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Assistance of Director / MD / CEO</Text>
          {t.assistanceNote ? <Text style={text.body}>Asked: {t.assistanceNote}</Text> : null}
          {t.assistanceReply ? <Text style={[text.body, styles.line]}>Reply: {t.assistanceReply}</Text> : null}
          {!t.assistanceNeeded ? <Text style={[text.muted, styles.line]}>Attended.</Text> : null}
        </Card>
      ) : null}

      {t.extensionRequestDate ? (
        <Card>
          <Text style={[text.h2, styles.section]}>More time asked</Text>
          <Text style={text.body}>
            Wants the deadline on {formatDate(t.extensionRequestDate)}
            {t.extensionRequestNote ? ` — ${t.extensionRequestNote}` : ''}
          </Text>
          {owner && isOpen(t) ? (
            <View style={styles.gap}>
              <Button title={`Give ${formatDate(t.extensionRequestDate)}`} loading={update.isPending} onPress={() => send('Approve more time', { extensionDecision: 'APPROVE' })} />
              <View style={styles.gapSmall} />
              <Button title="Decline" variant="secondary" disabled={update.isPending} onPress={() => send('Decline more time', { extensionDecision: 'DECLINE' })} />
            </View>
          ) : (
            <Text style={[text.muted, styles.line]}>Waiting for the decision.</Text>
          )}
        </Card>
      ) : null}

      {isApprover ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Actions</Text>
          <View style={styles.action}>
            <Button title="Approve" loading={update.isPending} onPress={() => send('Approve', { assignmentDecision: 'APPROVE' })} />
          </View>
          <View style={styles.action}>
            <Button title="Not Approve" variant="secondary" disabled={update.isPending} onPress={() => send('Not approve', { assignmentDecision: 'REJECT' })} />
          </View>
        </Card>
      ) : isOpen(t) ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Actions</Text>
          {mine && t.status === 'OPEN' ? (
            <View style={styles.action}>
              <Button title="Start" variant="secondary" disabled={update.isPending} onPress={() => send('Start', { status: 'IN_PROGRESS' })} />
            </View>
          ) : null}
          {mine || owner ? (
            <View style={styles.action}>
              <ReasonAction title="Mark as Done" label="What was done" confirmTitle="Save as Done" busy={update.isPending} onSubmit={(remarks) => send('Done', { status: 'DONE', remarks })} />
            </View>
          ) : null}
          {mine && !t.assistanceNeeded ? (
            <View style={styles.action}>
              <ReasonAction title="Ask Assistance of Director / MD / CEO" label="What assistance is needed" confirmTitle="Ask for Assistance" busy={update.isPending} onSubmit={(assistanceNote) => send('Ask assistance', { assistanceNeeded: true, assistanceNote })} />
            </View>
          ) : null}
          {owner && t.assistanceNeeded ? (
            <View style={styles.action}>
              <ReasonAction title="Reply to Assistance" label="Your reply" confirmTitle="Send Reply" busy={update.isPending} onSubmit={(assistanceReply) => send('Reply', { assistanceReply })} />
            </View>
          ) : null}
          {mine && !owner && t.dueDate && !t.extensionRequestDate && form === null ? (
            <View style={styles.action}>
              <Button title="Ask More Time" variant="secondary" onPress={() => setForm('moretime')} />
            </View>
          ) : null}
          {owner && form === null ? (
            <View style={styles.action}>
              <Button title={t.dueDate ? 'Change Deadline' : 'Set Deadline'} variant="secondary" onPress={() => setForm('extend')} />
            </View>
          ) : null}
          {form ? (
            <View style={styles.action}>
              <DateField label={form === 'moretime' ? 'Date wanted *' : 'New deadline *'} value={date} minimumDate={form === 'moretime' ? dayAfterDue : undefined} onChange={setDate} />
              <Field label={form === 'moretime' ? 'Why more time is needed *' : 'Reason *'} value={reason} onChangeText={setReason} multiline maxLength={1000} />
              <Button title={form === 'moretime' ? 'Ask for More Time' : 'Save Deadline'} loading={update.isPending} onPress={saveDate} />
              <View style={styles.gapSmall} />
              <Button title="Cancel" variant="secondary" onPress={() => setForm(null)} />
            </View>
          ) : null}
          {owner ? (
            <View style={styles.action}>
              <ReasonAction title="Cancel Task" label="Why is it cancelled" confirmTitle="Cancel Task" danger busy={update.isPending} onSubmit={(remarks) => send('Cancel', { status: 'CANCELLED', remarks })} />
            </View>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const newLine = () => ({ key: Math.random().toString(36).slice(2), title: '', due: null as Date | null });

/** Search-and-pick one employee from the people this user may give a task to. */
function PersonPicker({ label, people, value, onChange }: { label: string; people: Assignee[]; value: string; onChange: (id: string) => void }) {
  const [term, setTerm] = useState('');
  const picked = people.find((p) => p.id === value);
  const shown = useMemo(() => {
    const s = term.trim().toLowerCase();
    return (s ? people.filter((p) => p.fullName.toLowerCase().includes(s)) : people).slice(0, 8);
  }, [people, term]);
  if (picked)
    return (
      <View style={styles.picked}>
        <View style={styles.flex}>
          <Text style={text.muted}>{label}</Text>
          <Text style={text.body}>{[picked.fullName, picked.designation?.name].filter(Boolean).join(' · ')}</Text>
        </View>
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Change ${label}`}>
          <Text style={styles.change}>Change</Text>
        </Pressable>
      </View>
    );
  return (
    <View>
      <Field label={label} value={term} onChangeText={setTerm} placeholder="Type a name" />
      <View style={styles.people}>
        {shown.map((p) => (
          <Pressable key={p.id} style={styles.person} onPress={() => { onChange(p.id); setTerm(''); }} accessibilityRole="button">
            <Text style={styles.personText}>{p.fullName}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Give tasks: who, department, task type, product / service, assistants — then the tasks one by one, each with its deadline. */
export function TaskFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'TaskForm'>) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const people = useQuery({ queryKey: ['tasks', 'assignees'], queryFn: () => api.get<Assignee[]>('/tasks/assignees') });
  const types = useQuery({ queryKey: ['tasks', 'types'], queryFn: () => api.get<Named[]>('/tasks/types') });
  const departments = useQuery({ queryKey: ['org', 'departments'], queryFn: () => api.get<Named[]>('/org/departments'), retry: false });
  const branches = useQuery({ queryKey: ['branches'], queryFn: () => api.get<Named[]>('/branches'), retry: false });
  const [assignedToId, setAssignedToId] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [taskTypeId, setTaskTypeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [subjectKind, setSubjectKind] = useState<'PRODUCT' | 'SERVICE' | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [assistUserId, setAssistUserId] = useState('');
  const [assistBranchId, setAssistBranchId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState(() => [newLine()]);
  const [error, setError] = useState<string | null>(null);
  const opts = (rows: Named[] | undefined) => (rows ?? []).map((r) => ({ value: r.id, label: r.name }));

  function pickPerson(id: string) {
    setAssignedToId(id);
    // The department follows the person chosen, and can still be changed.
    const dep = people.data?.find((p) => p.id === id)?.departmentId;
    if (dep) setDepartmentId(dep);
  }

  const save = useMutation({
    mutationFn: (filled: Array<{ title: string; dueDate?: string }>) =>
      api.post('/tasks/batch', {
        assignedToId: assignedToId || user?.id,
        departmentId: departmentId ?? undefined,
        taskTypeId: taskTypeId ?? undefined,
        priority,
        ...(subjectKind && subjectName.trim() ? { subjectKind, subjectName: subjectName.trim() } : {}),
        assistUserId: assistUserId || undefined,
        assistBranchId: assistBranchId ?? undefined,
        description: description.trim() || undefined,
        lines: filled,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not save the tasks.')),
  });

  function submit() {
    const filled = lines.filter((l) => l.title.trim()).map((l) => ({ title: l.title.trim(), ...(l.due ? { dueDate: isoDay(l.due) } : {}) }));
    if (filled.length === 0) return setError('Write at least one task.');
    if (filled.some((l) => l.title.length < 2)) return setError('Each task needs at least 2 letters.');
    if (subjectKind && !subjectName.trim()) return setError(`Write the ${subjectKind === 'PRODUCT' ? 'product' : 'service'} name.`);
    setError(null);
    save.mutate(filled);
  }
  const setLine = (key: string, patch: Partial<{ title: string; due: Date | null }>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      {error ? <ErrorBox message={error} /> : null}
      <Card>
        <PersonPicker label="Give to (empty = myself)" people={people.data ?? []} value={assignedToId} onChange={pickPerson} />
        {departments.data ? <ChipSelect label="Department" value={departmentId} options={opts(departments.data)} onChange={setDepartmentId} allowClear /> : null}
        <ChipSelect label="Task type" value={taskTypeId} options={opts(types.data)} onChange={setTaskTypeId} allowClear />
        <ChipSelect label="Priority" value={priority} options={PRIORITIES} onChange={(v) => v && setPriority(v)} />
        <ChipSelect label="About a product or a service" value={subjectKind} options={[{ value: 'PRODUCT' as const, label: 'Product' }, { value: 'SERVICE' as const, label: 'Service' }]} onChange={setSubjectKind} allowClear />
        {subjectKind ? <Field label={subjectKind === 'PRODUCT' ? 'Product name *' : 'Service name *'} value={subjectName} onChangeText={setSubjectName} maxLength={200} /> : null}
      </Card>
      <Card>
        <Text style={[text.h2, styles.section]}>Assistants (optional)</Text>
        <PersonPicker label="Assistant employee" people={(people.data ?? []).filter((p) => p.id !== assignedToId)} value={assistUserId} onChange={setAssistUserId} />
        {branches.data ? <ChipSelect label="Assistant branch" value={assistBranchId} options={opts(branches.data)} onChange={setAssistBranchId} allowClear /> : null}
      </Card>
      <Card>
        <Text style={[text.h2, styles.section]}>Tasks</Text>
        {lines.map((l, i) => (
          <View key={l.key} style={styles.taskLine}>
            <Field label={`Task ${i + 1}`} value={l.title} onChangeText={(v) => setLine(l.key, { title: v })} maxLength={200} multiline />
            <DateField label="Deadline" value={l.due} minimumDate={new Date()} onChange={(d) => setLine(l.key, { due: d })} allowClear />
            {lines.length > 1 ? <Button title="Remove" variant="secondary" onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /> : null}
          </View>
        ))}
        <Button title="+ Add Another Task" variant="secondary" disabled={lines.length >= 50} onPress={() => setLines((ls) => [...ls, newLine()])} />
      </Card>
      <Card>
        <Field label="Notes for all these tasks" value={description} onChangeText={setDescription} multiline maxLength={4000} />
        <Button title="Save Tasks" onPress={submit} loading={save.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg },
  list: { padding: space.lg, flexGrow: 1 },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  status: { fontSize: 12, fontWeight: '700' },
  line: { marginTop: 4 },
  overdue: { color: colors.danger, fontWeight: '700' },
  overdueBar: { color: colors.danger, fontWeight: '700', paddingHorizontal: space.lg, paddingTop: space.sm },
  flag: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.warning },
  notice: { marginBottom: space.md },
  section: { marginBottom: space.sm },
  gap: { marginTop: space.md },
  gapSmall: { height: space.sm },
  action: { marginBottom: space.sm },
  flex: { flex: 1 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  change: { color: colors.primary, fontWeight: '700' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  person: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.surface },
  personText: { color: colors.text, fontSize: 13 },
  taskLine: { borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: space.md, paddingBottom: space.md },
});
