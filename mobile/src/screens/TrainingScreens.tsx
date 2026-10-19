import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, Segmented } from '../components/inputs';
import { Badge, Button, Card, Empty, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { HrStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

type Status = 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface TrainingSession {
  id: string;
  title: string;
  audience: string | null;
  scheduledAt: string;
  location: string | null;
  capacity: number | null;
  status: Status;
  description: string | null;
  participantCount?: number;
}
interface TrainingDetail extends TrainingSession {
  participants: Array<{ id: string; user: { id: string; fullName: string }; attended: boolean }>;
}

type Tab = 'all' | 'UPCOMING' | 'COMPLETED';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'COMPLETED', label: 'Completed' },
];

/** Training & Development: internal training sessions. */
export function TrainingSessionsScreen({ navigation }: NativeStackScreenProps<HrStackParams, 'TrainingSessions'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('training.manage');
  const [tab, setTab] = useState<Tab>('all');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage ? () => <Pressable onPress={() => navigation.navigate('TrainingSessionForm', {})} hitSlop={12} accessibilityRole="button" accessibilityLabel="Schedule training"><Text style={styles.headerBtn}>+ New</Text></Pressable> : undefined,
    });
  }, [navigation, canManage]);

  const list = useQuery({ queryKey: ['training', tab], queryFn: () => api.get<Paginated<TrainingSession>>('/training', { status: tab === 'all' ? undefined : tab, pageSize: 50 }) });
  const items = list.data?.items ?? [];

  return (
    <View style={styles.screen}>
      <Segmented value={tab} options={TABS} onChange={setTab} />
      {list.isError ? <View style={styles.pad}><ErrorBox message={errorText(list.error, 'Could not load training sessions.')} /></View> : null}
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}>
        {list.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {list.data && items.length === 0 ? <Empty title="No training sessions" hint={canManage ? 'Tap + New to schedule one.' : undefined} /> : null}
        {items.map((t) => (
          <Pressable key={t.id} style={styles.item} onPress={() => navigation.navigate('TrainingSessionDetail', { id: t.id, title: t.title })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{t.title}</Text>
              <Badge value={t.status} label={enumLabel(t.status)} />
            </View>
            <Text style={text.muted}>{t.audience ?? 'All'} · {t.location ?? 'Location not set'}</Text>
            <View style={styles.row}>
              <Text style={styles.when}>{formatWhen(t.scheduledAt)}</Text>
              <Text style={text.muted}>{t.participantCount ?? 0}{t.capacity ? ` / ${t.capacity}` : ''} enrolled</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** One training session and who's enrolled. */
export function TrainingSessionDetailScreen({ route, navigation }: NativeStackScreenProps<HrStackParams, 'TrainingSessionDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const canManage = hasPermission('training.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['training', 'one', id], queryFn: () => api.get<TrainingDetail>(`/training/${id}`) });
  const t = q.data;

  const toggleAttended = useMutation({
    mutationFn: ({ participantId, attended }: { participantId: string; attended: boolean }) => api.patch(`/training/participants/${participantId}/attended`, { attended }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['training', 'one', id] }),
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage ? () => <Pressable onPress={() => navigation.navigate('TrainingSessionForm', { id })} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit training"><Text style={styles.headerBtn}>Edit</Text></Pressable> : undefined,
    });
  }, [navigation, canManage, id]);

  if (q.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  if (!t) return <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load this training session.')} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.row}>
          <Text style={[text.h1, styles.flex]} numberOfLines={2}>{t.title}</Text>
          <Badge value={t.status} label={enumLabel(t.status)} />
        </View>
        <Text style={text.muted}>{t.audience ?? 'All'} · {t.location ?? 'Location not set'}</Text>
        <Text style={text.muted}>{formatWhen(t.scheduledAt)}{t.capacity ? ` · Capacity ${t.capacity}` : ''}</Text>
        {t.description ? <Text style={[text.body, styles.description]}>{t.description}</Text> : null}
      </Card>

      <Text style={[text.h2, styles.section]}>Participants ({t.participants.length})</Text>
      {t.participants.length === 0 ? (
        <Empty title="No one enrolled yet" />
      ) : (
        <Card>
          {t.participants.map((p) => (
            <View key={p.id} style={styles.participantRow}>
              <Text style={text.body}>{p.user.fullName}</Text>
              {canManage ? (
                <Pressable onPress={() => toggleAttended.mutate({ participantId: p.id, attended: !p.attended })} accessibilityRole="button">
                  <Badge value={p.attended ? 'ATTENDED' : 'ENROLLED'} label={p.attended ? 'Attended' : 'Enrolled'} />
                </Pressable>
              ) : (
                <Badge value={p.attended ? 'ATTENDED' : 'ENROLLED'} label={p.attended ? 'Attended' : 'Enrolled'} />
              )}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

/** Schedule or edit a training session. */
export function TrainingSessionFormScreen({ route, navigation }: NativeStackScreenProps<HrStackParams, 'TrainingSessionForm'>) {
  const id = route.params?.id;
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['training', 'one', id], queryFn: () => api.get<TrainingDetail>(`/training/${id}`), enabled: !!id });
  const t = existing.data;
  if (id && existing.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;

  const [title, setTitle] = useState(t?.title ?? '');
  const [audience, setAudience] = useState(t?.audience ?? '');
  const [location, setLocation] = useState(t?.location ?? '');
  const [capacity, setCapacity] = useState(t?.capacity ? String(t.capacity) : '');
  const [status, setStatus] = useState<Status>(t?.status ?? 'UPCOMING');
  const [date, setDate] = useState(t?.scheduledAt ? t.scheduledAt.slice(0, 10) : '');
  const [time, setTime] = useState(t?.scheduledAt ? t.scheduledAt.slice(11, 16) : '10:00');
  const [description, setDescription] = useState(t?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const data = { title: title.trim(), audience: audience.trim() || undefined, location: location.trim() || undefined, capacity: capacity.trim() ? Number(capacity) : undefined, status, scheduledAt: `${date}T${time}:00`, description: description.trim() || undefined };
      return t ? api.patch(`/training/${t.id}`, data) : api.post('/training', data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['training'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not save the training session.')),
  });

  function submit() {
    if (!title.trim()) return setError('Enter the training title.');
    if (!date) return setError('Enter the date (YYYY-MM-DD).');
    setError(null);
    save.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Training title *" value={title} onChangeText={setTitle} maxLength={200} />
        <Field label="Audience (e.g. For Sales Team)" value={audience} onChangeText={setAudience} maxLength={150} />
        <Field label="Location" value={location} onChangeText={setLocation} maxLength={150} />
        <Field label="Date (YYYY-MM-DD) *" value={date} onChangeText={setDate} />
        <Field label="Time (HH:MM)" value={time} onChangeText={setTime} />
        <Field label="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
        <ChipSelect label="Status" value={status} options={[{ value: 'UPCOMING', label: 'Upcoming' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }]} onChange={(v) => v && setStatus(v as Status)} />
        <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={4000} />
        <Button title={t ? 'Save Session' : 'Schedule Session'} onPress={submit} loading={save.isPending} />
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  when: { fontSize: 13, fontWeight: '700', color: colors.text },
  description: { marginTop: space.sm },
  section: { marginBottom: space.sm },
  participantRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
