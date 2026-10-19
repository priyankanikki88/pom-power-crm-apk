import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Segmented } from '../components/inputs';
import { Badge, Button, Card, Empty, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { HrStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

type Status = 'PENDING' | 'COMPLETED';
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface Appraisal {
  id: string;
  user: { id: string; fullName: string; designation: string | null };
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: Status;
  rating: number | null;
  reviewerComments: string | null;
}

type Tab = 'all' | Status;
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
];

/** The financial year (Apr-Mar) containing today — the period a new appraisal cycle covers by default. */
function currentFinancialYear(): { periodStart: string; periodEnd: string } {
  const now = new Date();
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { periodStart: `${fyStartYear}-04-01`, periodEnd: `${fyStartYear + 1}-03-31` };
}

/** Performance & Appraisal: one review per employee per financial year. */
export function AppraisalsScreen({ navigation }: NativeStackScreenProps<HrStackParams, 'Appraisals'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('performance.manage');
  const [tab, setTab] = useState<Tab>('all');
  const list = useQuery({ queryKey: ['appraisals', tab], queryFn: () => api.get<Paginated<Appraisal>>('/appraisals', { status: tab === 'all' ? undefined : tab, pageSize: 100 }) });
  const items = list.data?.items ?? [];

  return (
    <View style={styles.screen}>
      <Segmented value={tab} options={TABS} onChange={setTab} />
      {canManage ? (
        <Pressable style={styles.newRow} onPress={() => navigation.navigate('AppraisalForm')} accessibilityRole="button">
          <Text style={styles.newLink}>+ Start an Appraisal</Text>
        </Pressable>
      ) : null}
      {list.isError ? <View style={styles.pad}><ErrorBox message={errorText(list.error, 'Could not load appraisals.')} /></View> : null}
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}>
        {list.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {list.data && items.length === 0 ? <Empty title="No appraisals" /> : null}
        {items.map((a) => (
          <Pressable key={a.id} style={styles.item} onPress={() => navigation.navigate('AppraisalDetail', { id: a.id, name: a.user.fullName })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.name}>{a.user.fullName}</Text>
              <Badge value={a.status} label={enumLabel(a.status)} />
            </View>
            <Text style={text.muted}>{a.user.designation ?? 'No Designation'}</Text>
            <View style={styles.row}>
              <Text style={text.muted}>Due {formatDate(a.dueDate)}</Text>
              {a.rating !== null ? <Text style={styles.rating}>★ {a.rating}</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** One appraisal — the rating/comments form if still pending and the viewer can decide it, read-only once completed. */
export function AppraisalDetailScreen({ route }: NativeStackScreenProps<HrStackParams, 'AppraisalDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const canManage = hasPermission('performance.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['appraisals', 'one', id], queryFn: () => api.get<Appraisal>(`/appraisals/${id}`) });
  const a = q.data;
  const [rating, setRating] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: () => api.patch(`/appraisals/${id}/decide`, { rating: Number(rating), reviewerComments: comments.trim() || undefined }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['appraisals'] }),
    onError: (err) => setError(errorText(err, 'Could not save the decision.')),
  });

  function submit() {
    const r = Number(rating);
    if (!rating.trim() || Number.isNaN(r) || r < 0 || r > 5) return setError('Enter a rating from 0 to 5.');
    setError(null);
    decide.mutate();
  }

  if (q.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  if (!a) return <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load this appraisal.')} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.row}>
          <Text style={[text.h1, styles.flex]}>{a.user.fullName}</Text>
          <Badge value={a.status} label={enumLabel(a.status)} />
        </View>
        <Text style={text.muted}>{a.user.designation ?? 'No Designation'}</Text>
        <Text style={text.muted}>{formatDate(a.periodStart)} – {formatDate(a.periodEnd)} · Due {formatDate(a.dueDate)}</Text>
      </Card>

      {a.status === 'COMPLETED' ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Rating: ★ {a.rating}</Text>
          {a.reviewerComments ? <Text style={text.body}>{a.reviewerComments}</Text> : null}
        </Card>
      ) : canManage ? (
        <Card>
          {error ? <ErrorBox message={error} /> : null}
          <Field label="Rating (0-5) *" value={rating} onChangeText={setRating} keyboardType="decimal-pad" />
          <Field label="Reviewer Comments" value={comments} onChangeText={setComments} multiline maxLength={4000} />
          <Button title="Complete Appraisal" onPress={submit} loading={decide.isPending} />
        </Card>
      ) : (
        <Empty title="Appraisal still pending" />
      )}
    </ScrollView>
  );
}

interface UserOption {
  id: string;
  fullName: string;
  employeeCode: string | null;
}

/** Starts a new appraisal cycle for an employee, defaulting to the current financial year. */
export function AppraisalFormScreen({ navigation }: NativeStackScreenProps<HrStackParams, 'AppraisalForm'>) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [employee, setEmployee] = useState<UserOption | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options = useQuery({ queryKey: ['users', 'picker'], queryFn: () => api.get<UserOption[]>('/users'), enabled: !employee });
  const filtered = (options.data ?? []).filter((u) => u.fullName.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 15);

  const save = useMutation({
    mutationFn: () => {
      const { periodStart, periodEnd } = currentFinancialYear();
      return api.post('/appraisals', { userId: employee!.id, periodStart, periodEnd, dueDate });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appraisals'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not start the appraisal.')),
  });

  function submit() {
    if (!employee) return setError('Choose an employee.');
    if (!dueDate.trim()) return setError('Enter the due date (YYYY-MM-DD).');
    setError(null);
    save.mutate();
  }

  const { periodStart, periodEnd } = currentFinancialYear();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Text style={styles.label}>Employee *</Text>
        {employee ? (
          <View style={styles.selected}>
            <Text style={text.body}>{employee.fullName}</Text>
            <Pressable onPress={() => setEmployee(null)} accessibilityRole="button"><Text style={styles.change}>Change</Text></Pressable>
          </View>
        ) : (
          <>
            <TextInput style={styles.search} placeholder="Search employee" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
            {filtered.map((u) => (
              <Pressable key={u.id} style={styles.result} onPress={() => setEmployee(u)} accessibilityRole="button">
                <Text style={text.body}>{u.fullName}</Text>
                {u.employeeCode ? <Text style={text.muted}>{u.employeeCode}</Text> : null}
              </Pressable>
            ))}
          </>
        )}
        <Text style={text.muted}>Period: {periodStart} to {periodEnd} (current financial year)</Text>
        <Field label="Due date (YYYY-MM-DD) *" value={dueDate} onChangeText={setDueDate} />
        <Button title="Start Appraisal" onPress={submit} loading={save.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  loading: { padding: space.xl },
  flex: { flex: 1 },
  newRow: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  newLink: { color: colors.primaryDark, fontWeight: '700', fontSize: 13.5 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  rating: { fontSize: 13, fontWeight: '700', color: colors.warning },
  section: { marginBottom: space.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  selected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  change: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface, marginBottom: space.sm },
  result: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
