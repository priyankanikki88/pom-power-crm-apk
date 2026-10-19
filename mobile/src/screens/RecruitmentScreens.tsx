import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, DateField, Segmented } from '../components/inputs';
import { Badge, Button, Card, Empty, ErrorBox, Field, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dayFromIso, formatDate, isoDay } from '../lib/dates';
import { enumLabel, formatINRCompact } from '../lib/format';
import type { HrStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

type OpeningStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
type AppStatus = 'NEW' | 'SHORTLISTED' | 'INTERVIEW' | 'OFFERED' | 'HIRED' | 'REJECTED';
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface JobOpening {
  id: string;
  title: string;
  status: OpeningStatus;
  department: { id: string; name: string } | null;
  location: string | null;
  openings: number;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string | null;
  postedDate: string;
  closingDate: string | null;
  applicationCount?: number;
}
interface Application {
  id: string;
  candidateName: string;
  phone: string | null;
  email: string | null;
  experienceYears: number | null;
  status: AppStatus;
  notes: string | null;
  appliedAt: string;
}
interface JobOpeningDetail extends JobOpening {
  applications: Application[];
}

type Tab = 'all' | OpeningStatus;
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'CLOSED', label: 'Closed' },
];

/** Recruitment: job openings being hired for. */
export function JobOpeningsScreen({ navigation }: NativeStackScreenProps<HrStackParams, 'JobOpenings'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('recruitment.manage');
  const [tab, setTab] = useState<Tab>('all');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage ? () => <Pressable onPress={() => navigation.navigate('JobOpeningForm', {})} hitSlop={12} accessibilityRole="button" accessibilityLabel="Add job opening"><Text style={styles.headerBtn}>+ New</Text></Pressable> : undefined,
    });
  }, [navigation, canManage]);

  const list = useQuery({ queryKey: ['job-openings', tab, search], queryFn: () => api.get<Paginated<JobOpening>>('/recruitment/job-openings', { status: tab === 'all' ? undefined : tab, search: search || undefined, pageSize: 50 }) });
  const items = list.data?.items ?? [];

  return (
    <View style={styles.screen}>
      <Segmented value={tab} options={TABS} onChange={setTab} />
      <View style={styles.searchBox}>
        <TextInput value={input} onChangeText={setInput} placeholder="Search position…" placeholderTextColor={colors.muted} style={styles.search} autoCapitalize="none" />
      </View>
      {list.isError ? <View style={styles.pad}><ErrorBox message={errorText(list.error, 'Could not load job openings.')} /></View> : null}
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}>
        {list.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {list.data && items.length === 0 ? <Empty title="No job openings" hint={canManage ? 'Tap + New to add one.' : undefined} /> : null}
        {items.map((o) => (
          <Pressable key={o.id} style={styles.item} onPress={() => navigation.navigate('JobOpeningDetail', { id: o.id, title: o.title })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{o.title}</Text>
              <Badge value={o.status} label={enumLabel(o.status)} />
            </View>
            <Text style={text.muted}>{o.department?.name ?? 'No Department'} · {o.location ?? 'Location not set'}</Text>
            <View style={styles.row}>
              <Text style={styles.openings}>{o.openings} opening{o.openings === 1 ? '' : 's'}</Text>
              <Text style={text.muted}>{o.applicationCount ?? 0} application{o.applicationCount === 1 ? '' : 's'}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** One job opening and the candidates who've applied. */
export function JobOpeningDetailScreen({ route, navigation }: NativeStackScreenProps<HrStackParams, 'JobOpeningDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const canManage = hasPermission('recruitment.manage');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['job-openings', 'one', id], queryFn: () => api.get<JobOpeningDetail>(`/recruitment/job-openings/${id}`) });
  const o = q.data;

  const decide = useMutation({
    mutationFn: ({ appId, status }: { appId: string; status: AppStatus }) => api.patch(`/recruitment/applications/${appId}`, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['job-openings', 'one', id] }),
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage ? () => <Pressable onPress={() => navigation.navigate('JobOpeningForm', { id })} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit job opening"><Text style={styles.headerBtn}>Edit</Text></Pressable> : undefined,
    });
  }, [navigation, canManage, id]);

  if (q.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  if (!o) return <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load this job opening.')} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.row}>
          <Text style={[text.h1, styles.flex]} numberOfLines={2}>{o.title}</Text>
          <Badge value={o.status} label={enumLabel(o.status)} />
        </View>
        <Text style={text.muted}>{o.department?.name ?? 'No Department'} · {o.location ?? 'Location not set'}</Text>
        <Text style={text.muted}>{o.openings} opening{o.openings === 1 ? '' : 's'} · Posted {formatDate(o.postedDate)}{o.closingDate ? ` · Closes ${formatDate(o.closingDate)}` : ''}</Text>
        {o.experienceMinYears !== null || o.experienceMaxYears !== null ? <Text style={text.muted}>Experience: {o.experienceMinYears ?? 0}–{o.experienceMaxYears ?? '?'} yrs</Text> : null}
        {o.salaryMin !== null || o.salaryMax !== null ? <Text style={text.muted}>Salary: {o.salaryMin ? formatINRCompact(o.salaryMin) : '?'} – {o.salaryMax ? formatINRCompact(o.salaryMax) : '?'}</Text> : null}
        {o.description ? <Text style={[text.body, styles.description]}>{o.description}</Text> : null}
      </Card>

      <View style={styles.row}>
        <Text style={[text.h2, styles.section]}>Applications ({o.applications.length})</Text>
        {canManage ? <Pressable onPress={() => navigation.navigate('JobApplicationForm', { jobOpeningId: id })} accessibilityRole="button"><Text style={styles.addLink}>+ Add</Text></Pressable> : null}
      </View>
      {o.applications.length === 0 ? (
        <Empty title="No applications yet" />
      ) : (
        o.applications.map((a) => (
          <Card key={a.id}>
            <View style={styles.row}>
              <Text style={styles.name}>{a.candidateName}</Text>
              <Badge value={a.status} label={enumLabel(a.status)} />
            </View>
            <Text style={text.muted}>{a.experienceYears !== null ? `${a.experienceYears} yrs exp` : 'Experience not given'}{a.phone ? ` · ${a.phone}` : ''}</Text>
            {a.notes ? <Text style={text.muted}>{a.notes}</Text> : null}
            {canManage && !['HIRED', 'REJECTED'].includes(a.status) ? (
              <View style={styles.actionsRow}>
                {(['SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED'] as AppStatus[]).filter((s) => s !== a.status).slice(0, 3).map((s) => (
                  <Pressable key={s} style={styles.statusChip} onPress={() => decide.mutate({ appId: a.id, status: s })} accessibilityRole="button">
                    <Text style={styles.statusChipText}>{enumLabel(s)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

/** Add or edit a job opening. */
export function JobOpeningFormScreen({ route, navigation }: NativeStackScreenProps<HrStackParams, 'JobOpeningForm'>) {
  const id = route.params?.id;
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ['job-openings', 'one', id], queryFn: () => api.get<JobOpeningDetail>(`/recruitment/job-openings/${id}`), enabled: !!id });
  const o = existing.data;
  if (id && existing.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;

  const [title, setTitle] = useState(o?.title ?? '');
  const [location, setLocation] = useState(o?.location ?? '');
  const [openings, setOpenings] = useState(String(o?.openings ?? '1'));
  const [status, setStatus] = useState<OpeningStatus>(o?.status ?? 'OPEN');
  const [postedDate, setPostedDate] = useState<Date | null>(dayFromIso(o?.postedDate) ?? new Date());
  const [closingDate, setClosingDate] = useState<Date | null>(dayFromIso(o?.closingDate ?? undefined));
  const [description, setDescription] = useState(o?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const data = { title: title.trim(), location: location.trim() || undefined, openings: Number(openings) || 1, status, postedDate: postedDate ? isoDay(postedDate) : undefined, closingDate: closingDate ? isoDay(closingDate) : null, description: description.trim() || undefined };
      return o ? api.patch(`/recruitment/job-openings/${o.id}`, data) : api.post('/recruitment/job-openings', data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['job-openings'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not save the job opening.')),
  });

  function submit() {
    if (!title.trim()) return setError('Enter the job title.');
    if (!postedDate) return setError('Choose a posted date.');
    setError(null);
    save.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Job title *" value={title} onChangeText={setTitle} maxLength={200} />
        <Field label="Location" value={location} onChangeText={setLocation} maxLength={150} />
        <Field label="Number of openings" value={openings} onChangeText={setOpenings} keyboardType="number-pad" />
        <ChipSelect label="Status" value={status} options={[{ value: 'OPEN', label: 'Open' }, { value: 'IN_PROGRESS', label: 'In Progress' }, { value: 'CLOSED', label: 'Closed' }]} onChange={(v) => v && setStatus(v as OpeningStatus)} />
        <DateField label="Posted date *" value={postedDate} onChange={setPostedDate} />
        <DateField label="Closing date" value={closingDate} onChange={setClosingDate} allowClear />
        <Field label="Job description" value={description} onChangeText={setDescription} multiline maxLength={4000} />
        <Button title={o ? 'Save Opening' : 'Create Opening'} onPress={submit} loading={save.isPending} />
      </Card>
    </ScrollView>
  );
}

/** Record a candidate's application to a job opening. */
export function JobApplicationFormScreen({ route, navigation }: NativeStackScreenProps<HrStackParams, 'JobApplicationForm'>) {
  const { jobOpeningId } = route.params;
  const qc = useQueryClient();
  const [candidateName, setCandidateName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.post(`/recruitment/job-openings/${jobOpeningId}/applications`, { candidateName: candidateName.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, experienceYears: experienceYears.trim() ? Number(experienceYears) : undefined, notes: notes.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['job-openings', 'one', jobOpeningId] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not save the application.')),
  });

  function submit() {
    if (!candidateName.trim()) return setError("Enter the candidate's name.");
    setError(null);
    save.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Candidate name *" value={candidateName} onChangeText={setCandidateName} maxLength={150} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={150} />
        <Field label="Experience (years)" value={experienceYears} onChangeText={setExperienceYears} keyboardType="decimal-pad" />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
        <Button title="Save Application" onPress={submit} loading={save.isPending} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  searchBox: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  pad: { padding: space.lg },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  loading: { padding: space.xl },
  flex: { flex: 1 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  openings: { fontSize: 13, fontWeight: '700', color: colors.text },
  description: { marginTop: space.sm },
  section: { marginBottom: space.sm },
  addLink: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: space.xs, marginTop: space.sm, flexWrap: 'wrap' },
  statusChip: { paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primarySoft },
  statusChipText: { fontSize: 11.5, fontWeight: '700', color: colors.primaryDark },
});
