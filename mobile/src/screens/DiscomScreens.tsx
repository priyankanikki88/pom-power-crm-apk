import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { CustomerPicker, type PickedCustomer } from '../components/CustomerPicker';
import { ChipSelect, DateField } from '../components/inputs';
import { Badge, Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dayFromIso, formatDate, isoDay } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface Discom {
  id: string;
  name: string;
  code: string | null;
  state: string | null;
  contactPerson: string | null;
  phone: string | null;
  active: boolean;
}
const STAGES = [
  { key: 'finance', label: 'Finance' },
  { key: 'intimation', label: 'Discom Intimation' },
  { key: 'netMetering', label: 'Net Metering' },
  { key: 'subsidy', label: 'Subsidy' },
] as const;
type StageKey = (typeof STAGES)[number]['key'];
const STAGE_STATUSES = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;
interface Stage {
  status: (typeof STAGE_STATUSES)[number]['value'];
  date: string | null;
  ref: string | null;
  notes: string | null;
  amount?: number | null;
}
interface DiscomCase {
  id: string;
  caseNo: string;
  customer: { id: string; name: string; customerCode: string } | null;
  discom: { id: string; name: string } | null;
  consumerNo: string | null;
  capacityKw: number | null;
  stages: Record<StageKey, Stage>;
  status: 'OPEN' | 'CLOSED' | 'REJECTED';
}

const useDiscoms = () => useQuery({ queryKey: ['discoms', 'list'], queryFn: () => api.get<Discom[]>('/discoms') });
const useCases = () => useQuery({ queryKey: ['discom-cases', 'list'], queryFn: () => api.get<DiscomCase[]>('/discom-cases') });

/** B2C Cases: the post-installation Discom paperwork for installed customers — four stages, newest case first. */
export function B2CCasesScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'B2CCases'>) {
  const list = useCases();
  const { hasPermission } = useAuth();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasPermission('discom.manage') ? (
          <Pressable onPress={() => navigation.navigate('B2CCaseForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Open a B2C case">
            <Text style={styles.headerBtn}>+ New</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, hasPermission]);
  const items = list.data ?? [];

  return (
    <View style={styles.screen}>
      {list.isError ? (
        <View style={styles.pad}>
          <ErrorBox message={errorText(list.error, 'Could not load B2C cases.')} />
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No B2C cases yet" hint="Tap + New to open one for an installed customer." />}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('B2CCaseDetail', { id: item.id, caseNo: item.caseNo })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.no}>{item.caseNo}</Text>
              <Badge value={item.status} label={enumLabel(item.status)} />
            </View>
            <Text style={styles.name}>{item.customer?.name ?? '—'}</Text>
            <Text style={text.muted}>{item.discom?.name ?? 'No Discom set'}</Text>
            <View style={styles.chipsRow}>
              {STAGES.map((s) => (
                <View key={s.key} style={styles.miniBadge}>
                  <Text style={styles.miniBadgeText}>
                    {s.label}: {enumLabel(item.stages[s.key].status)}
                  </Text>
                </View>
              ))}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

export function B2CCaseFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'B2CCaseForm'>) {
  const qc = useQueryClient();
  const discoms = useDiscoms();
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [discomId, setDiscomId] = useState<string | null>(null);
  const [consumerNo, setConsumerNo] = useState('');
  const [capacityKw, setCapacityKw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.post<DiscomCase>('/discom-cases', { customerId: customer!.id, discomId: discomId ?? undefined, consumerNo: consumerNo.trim() || undefined, capacityKw: capacityKw ? Number(capacityKw) : undefined }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['discom-cases'] });
      navigation.replace('B2CCaseDetail', { id: c.id, caseNo: c.caseNo });
    },
    onError: (err) => setError(errorText(err, 'Could not open the case.')),
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <CustomerPicker value={customer} onChange={setCustomer} />
        {customer ? (
          <>
            <ChipSelect label="Discom" value={discomId} allowClear options={(discoms.data ?? []).map((d) => ({ value: d.id, label: d.name }))} onChange={setDiscomId} />
            <Field label="Consumer No." value={consumerNo} onChangeText={setConsumerNo} maxLength={60} />
            <Field label="Capacity (kW)" value={capacityKw} onChangeText={setCapacityKw} keyboardType="decimal-pad" />
            <Button title="Open Case" onPress={() => save.mutate()} loading={save.isPending} />
          </>
        ) : null}
      </Card>
    </ScrollView>
  );
}

function StageCard({ caseId, stageKey, label, stage, canManage }: { caseId: string; stageKey: StageKey; label: string; stage: Stage; canManage: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Stage['status']>(stage.status);
  const [date, setDate] = useState<Date | null>(dayFromIso(stage.date));
  const [ref, setRef] = useState(stage.ref ?? '');
  const [notes, setNotes] = useState(stage.notes ?? '');
  const [amount, setAmount] = useState(stage.amount != null ? String(stage.amount) : '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/discom-cases/${caseId}`, {
        [stageKey]: { status, date: date ? isoDay(date) : '', ref: ref.trim() || undefined, notes: notes.trim() || undefined, ...(stageKey === 'subsidy' ? { amount: amount ? Number(amount) : undefined } : {}) },
      }),
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['discom-cases'] });
    },
    onError: (err) => setError(errorText(err, 'Could not save this stage.')),
  });

  return (
    <Card>
      <View style={styles.row}>
        <Text style={text.h2}>{label}</Text>
        <Badge value={stage.status} label={enumLabel(stage.status)} />
      </View>
      {!editing ? (
        <>
          <Row label="Date" value={stage.date ? formatDate(stage.date) : null} />
          <Row label="Reference" value={stage.ref} />
          {stageKey === 'subsidy' ? <Row label="Amount" value={stage.amount != null ? formatINR(stage.amount) : null} /> : null}
          <Row label="Notes" value={stage.notes} />
          {canManage ? (
            <View style={styles.gap}>
              <Button title="Update" variant="secondary" onPress={() => setEditing(true)} />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.gap}>
          {error ? <ErrorBox message={error} /> : null}
          <ChipSelect label="Status" value={status} options={STAGE_STATUSES as unknown as Array<{ value: Stage['status']; label: string }>} onChange={(v) => v && setStatus(v)} />
          <DateField label="Date" value={date} onChange={setDate} allowClear />
          <Field label="Reference" value={ref} onChangeText={setRef} maxLength={100} />
          {stageKey === 'subsidy' ? <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /> : null}
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={4000} />
          <Button title="Save" onPress={() => save.mutate()} loading={save.isPending} />
          <View style={styles.gap} />
          <Button title="Cancel" variant="secondary" onPress={() => setEditing(false)} />
        </View>
      )}
    </Card>
  );
}

export function B2CCaseDetailScreen({ route }: NativeStackScreenProps<MoreStackParams, 'B2CCaseDetail'>) {
  const { hasPermission } = useAuth();
  const q = useQuery({ queryKey: ['discom-cases', 'one', route.params.id], queryFn: () => api.get<DiscomCase>(`/discom-cases/${route.params.id}`) });
  const c = q.data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.pad} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load this case.')} /> : null}
      {c ? (
        <>
          <Card>
            <Row label="Customer" value={c.customer?.name} />
            <Row label="Discom" value={c.discom?.name} />
            <Row label="Consumer No." value={c.consumerNo} />
            <Row label="Capacity" value={c.capacityKw != null ? `${c.capacityKw} kW` : null} />
            <Row label="Status" value={<Badge value={c.status} label={enumLabel(c.status)} />} />
          </Card>
          {STAGES.map((s) => (
            <StageCard key={s.key} caseId={c.id} stageKey={s.key} label={s.label} stage={c.stages[s.key]} canManage={hasPermission('discom.manage')} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

/** Discom master: name, state, contact, portal. Simple add-only list from the phone — full editing stays on the web CRM. */
export function DiscomsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Discoms'>) {
  const list = useDiscoms();
  const { hasPermission } = useAuth();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasPermission('discom.manage') ? (
          <Pressable onPress={() => navigation.navigate('DiscomForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Add a Discom">
            <Text style={styles.headerBtn}>+ New</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, hasPermission]);
  const items = list.data ?? [];

  return (
    <View style={styles.screen}>
      {list.isError ? (
        <View style={styles.pad}>
          <ErrorBox message={errorText(list.error, 'Could not load Discoms.')} />
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No Discoms yet" hint="Tap + New to add one." />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              {!item.active ? <Badge value="INACTIVE" label="Inactive" /> : null}
            </View>
            <Text style={text.muted}>{[item.code, item.state].filter(Boolean).join(' · ') || '—'}</Text>
            <Text style={text.muted}>{[item.contactPerson, item.phone].filter(Boolean).join(' · ') || '—'}</Text>
          </View>
        )}
      />
    </View>
  );
}

export function DiscomFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'DiscomForm'>) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.post('/discoms', { name: name.trim(), code: code.trim() || undefined, state: state.trim() || undefined, contactPerson: contactPerson.trim() || undefined, phone: phone.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['discoms'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not save this Discom.')),
  });

  function submit() {
    if (name.trim().length < 1) return setError('Enter the Discom name.');
    setError(null);
    save.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Name *" value={name} onChangeText={setName} maxLength={150} autoFocus />
        <Field label="Code" value={code} onChangeText={setCode} maxLength={40} />
        <Field label="State" value={state} onChangeText={setState} maxLength={80} />
        <Field label="Contact person" value={contactPerson} onChangeText={setContactPerson} maxLength={150} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} />
        <Button title="Save Discom" onPress={submit} loading={save.isPending} />
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
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  no: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, marginVertical: 3 },
  gap: { marginTop: space.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  miniBadge: { backgroundColor: colors.bg, borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3 },
  miniBadgeText: { fontSize: 10.5, color: colors.muted, fontWeight: '600' },
});
