import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PdfButton } from '../components/docParts';
import { ChipSelect } from '../components/inputs';
import { AuthImage, PhotoAdder } from '../components/photos';
import { Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import { sendOrQueue } from '../lib/outbox';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

type ExpenseType = 'LOCAL' | 'TOUR' | 'CASH_VOUCHER' | 'BRANCH_OFFICE';
const TYPE_LABEL: Record<ExpenseType, string> = { LOCAL: 'Local Expense', TOUR: 'Tour Expense', CASH_VOUCHER: 'Cash Payment Voucher', BRANCH_OFFICE: 'Branch / Office Expense' };
const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', APPROVED: 'Approved', REJECTED: 'Rejected', SETTLED: 'Settled' };
const TONE: Record<string, string> = { DRAFT: colors.muted, SUBMITTED: colors.primaryDark, UNDER_REVIEW: colors.warning, APPROVED: colors.success, REJECTED: colors.danger, SETTLED: colors.success };

interface Claim {
  id: string;
  claimNo: string;
  type: ExpenseType;
  title: string | null;
  status: string;
  totalAmount: string;
  approvedAmount: string | null;
  remarks: string | null;
  decisionNote: string | null;
  createdAt: string;
  lines?: Array<Record<string, string | number | boolean | null>>;
  files?: Array<{ id: string; fileName: string; mimeType?: string }>;
  canEdit?: boolean;
  _count?: { lines: number; files: number };
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** My expense claims, newest first. */
export function ExpensesScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Expenses'>) {
  const list = useQuery({ queryKey: ['expenses', 'mine'], queryFn: () => api.get<Paginated<Claim>>('/expenses', { view: 'mine', pageSize: 50 }) });
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('ExpenseForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="New expense">
          <Text style={styles.headerBtn}>+ New</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      {list.isError ? <View style={styles.pad}><ErrorBox message={errorText(list.error, 'Could not load expenses.')} /></View> : null}
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No expense claims yet" hint="Tap + New to add one." />}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('ExpenseDetail', { id: item.id, no: item.claimNo })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.no}>{item.claimNo}</Text>
              <Text style={[styles.status, { color: TONE[item.status] ?? colors.muted }]}>{STATUS_LABEL[item.status] ?? enumLabel(item.status)}</Text>
            </View>
            <Text style={styles.name}>{item.title || TYPE_LABEL[item.type]}</Text>
            <View style={styles.row}>
              <Text style={text.muted}>
                {TYPE_LABEL[item.type]} · {formatDate(item.createdAt)}
              </Text>
              <Text style={styles.amount}>{formatINR(item.totalAmount)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

/** One claim: its entries, bill photos, and — while it is a draft — adding photos and submitting it for approval. */
export function ExpenseDetailScreen({ route }: NativeStackScreenProps<MoreStackParams, 'ExpenseDetail'>) {
  const { id } = route.params;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['expenses', 'one', id], queryFn: () => api.get<Claim>(`/expenses/${id}`) });
  const c = q.data;
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['expenses'] });
  const submit = useMutation({ mutationFn: () => api.post(`/expenses/${id}/submit`), onSuccess: refresh, onError: (err) => setError(errorText(err, 'Could not submit the claim.')) });

  if (q.isLoading) return <ActivityIndicator style={styles.pad} color={colors.primary} />;
  if (!c) return <View style={styles.pad}><ErrorBox message={errorText(q.error, 'Could not load this claim.')} /></View>;
  const draft = c.status === 'DRAFT';
  const images = (c.files ?? []).filter((f) => !f.mimeType || f.mimeType.startsWith('image/'));
  const others = (c.files ?? []).filter((f) => f.mimeType && !f.mimeType.startsWith('image/'));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.row}>
          <Text style={[text.h1, styles.flex]}>{c.claimNo}</Text>
          <Text style={[styles.status, { color: TONE[c.status] ?? colors.muted }]}>{STATUS_LABEL[c.status] ?? enumLabel(c.status)}</Text>
        </View>
        <Text style={[text.muted, styles.sub]}>{TYPE_LABEL[c.type]}</Text>
        <Row label="Title" value={c.title} />
        <Row label="Claimed" value={formatINR(c.totalAmount)} />
        <Row label="Approved" value={c.approvedAmount !== null ? formatINR(c.approvedAmount) : null} />
        <Row label="Remarks" value={c.remarks} />
        <Row label="Reviewer's note" value={c.decisionNote} />
        <PdfButton path={`/expenses/${id}/pdf`} fileName={c.claimNo} title={`Expense ${c.claimNo}`} />
      </Card>

      {error ? <ErrorBox message={error} /> : null}

      <Card>
        <Text style={[text.h2, styles.section]}>Entries ({c.lines?.length ?? 0})</Text>
        {(c.lines ?? []).map((l, i) => (
          <View key={i} style={styles.entry}>
            <View style={styles.row}>
              <Text style={[text.body, styles.flex]}>{formatDate(String(l.date))}</Text>
              {l.amount !== null && l.amount !== undefined ? <Text style={styles.amount}>{formatINR(l.amount as string)}</Text> : null}
            </View>
            <Text style={text.muted}>
              {[l.fromPlace && l.toPlace ? `${l.fromPlace} → ${l.toPlace}` : null, l.mode, l.distanceKm ? `${Number(l.distanceKm)} km` : null, l.placeVisited, l.paidTo ? `Paid to ${l.paidTo}` : null, l.purpose].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={[text.h2, styles.section]}>Bills / photos ({c.files?.length ?? 0})</Text>
        {images.map((f) => (
          <View key={f.id} style={styles.photo}>
            <AuthImage path={`/expenses/${id}/files/${f.id}`} cacheName={`expense-${id}-${f.id}.jpg`} />
          </View>
        ))}
        {others.map((f) => (
          <Text key={f.id} style={text.muted}>
            {f.fileName}
          </Text>
        ))}
        {c.status !== 'SETTLED' && c.canEdit !== false ? <PhotoAdder uploadPath={`/expenses/${id}/files`} onUploaded={refresh} /> : null}
      </Card>

      {draft && c.canEdit !== false ? (
        <Card>
          <Text style={[text.muted, styles.sub]}>This claim is a draft. Add the bill photos, then submit it for approval — it cannot be changed after that.</Text>
          <Button title="Submit for Approval" loading={submit.isPending} onPress={() => { setError(null); submit.mutate(); }} />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'].map((value) => ({ value, label: enumLabel(value) }));
const YES_NO = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];
const TYPES: Array<{ value: ExpenseType; label: string }> = [
  { value: 'LOCAL', label: 'Local Conveyance' },
  { value: 'TOUR', label: 'Tour Expense' },
  { value: 'CASH_VOUCHER', label: 'Cash Payment' },
];
const TOUR_HEADS = ['fare', 'hotel', 'boarding', 'lunch', 'telephone', 'porterage', 'conveyance', 'purchaseCourier', 'misc'] as const;
const TOUR_HEAD_LABEL: Record<(typeof TOUR_HEADS)[number], string> = {
  fare: 'Fare',
  hotel: 'Hotel',
  boarding: 'Boarding',
  lunch: 'Lunch',
  telephone: 'Telephone',
  porterage: 'Porterage',
  conveyance: 'Local conveyance',
  purchaseCourier: 'Purchase / courier',
  misc: 'Misc.',
};

/**
 * A new expense with one entry — the common field case (a local trip, a day's tour heads, or a cash payment). It is
 * saved as a draft so the bill photo can be added before submitting. Branch / office expenses, and claims with several
 * entries, are made on the web CRM.
 */
export function ExpenseFormScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'ExpenseForm'>) {
  const qc = useQueryClient();
  const [type, setType] = useState<ExpenseType>('LOCAL');
  const [date, setDate] = useState(() => new Date());
  const [picking, setPicking] = useState(false);
  const [f, setF] = useState({
    title: '',
    fromPlace: '',
    toPlace: '',
    distanceKm: '',
    mode: '',
    amount: '',
    purpose: '',
    paidTo: '',
    paymentMode: 'CASH',
    reference: '',
    placeVisited: '',
    nightStay: 'no',
    fare: '',
    hotel: '',
    boarding: '',
    lunch: '',
    telephone: '',
    porterage: '',
    conveyance: '',
    purchaseCourier: '',
    misc: '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const opt = (v: string) => v.trim() || undefined;
  const num = (v: string) => (v.trim() ? Number(v) : undefined);
  const tourTotal = TOUR_HEADS.reduce((sum, h) => sum + (Number(f[h]) || 0), 0);

  const create = useMutation({
    mutationFn: () => {
      const amount = Math.round(Number(f.amount) * 100) / 100;
      const line =
        type === 'LOCAL'
          ? { date: isoDate(date), fromPlace: opt(f.fromPlace), toPlace: opt(f.toPlace), distanceKm: f.distanceKm.trim() ? Number(f.distanceKm) : undefined, mode: opt(f.mode), amount, purpose: opt(f.purpose) }
          : type === 'TOUR'
            ? {
                date: isoDate(date),
                placeVisited: opt(f.placeVisited),
                nightStay: f.nightStay === 'yes',
                fare: num(f.fare),
                hotel: num(f.hotel),
                boarding: num(f.boarding),
                lunch: num(f.lunch),
                telephone: num(f.telephone),
                porterage: num(f.porterage),
                conveyance: num(f.conveyance),
                purchaseCourier: num(f.purchaseCourier),
                misc: num(f.misc),
                purpose: opt(f.purpose),
              }
            : { date: isoDate(date), paidTo: opt(f.paidTo), purpose: opt(f.purpose), amount, paymentMode: f.paymentMode, reference: opt(f.reference) };
      const label = type === 'LOCAL' ? `${f.fromPlace.trim()} to ${f.toPlace.trim()}` : type === 'TOUR' ? f.placeVisited.trim() : f.paidTo.trim();
      const total = type === 'TOUR' ? tourTotal : amount;
      return sendOrQueue<Claim>({ title: `Expense — ${formatINR(total)}, ${label}`, method: 'POST', path: '/expenses', body: { type, title: opt(f.title), lines: [line] }, refresh: ['expenses'] });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      if (res.queued) {
        Alert.alert('Saved on this phone', 'There is no network right now. The expense will be sent as a draft when the network is back — then open it under My Expenses to add the bill photo and submit it.');
        navigation.goBack();
      } else navigation.replace('ExpenseDetail', { id: res.data.id, no: res.data.claimNo });
    },
    onError: (err) => setError(errorText(err, 'Could not save the expense.')),
  });

  function submit() {
    if (f.distanceKm.trim() && !(Number(f.distanceKm) >= 0)) return setError('Enter a valid distance.');
    if (type === 'LOCAL') {
      if (!(Number(f.amount) > 0)) return setError('Enter the amount.');
      if (!(f.fromPlace.trim() && f.toPlace.trim())) return setError('Enter where you went from and to.');
    } else if (type === 'TOUR') {
      if (!f.placeVisited.trim()) return setError('Enter the place visited.');
      if (!(tourTotal > 0)) return setError('Enter at least one expense head.');
    } else {
      if (!(Number(f.amount) > 0)) return setError('Enter the amount.');
      if (!f.paidTo.trim()) return setError('Enter who was paid.');
    }
    setError(null);
    create.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <ChipSelect label="Type *" value={type} options={TYPES} onChange={(v) => v && setType(v)} />
        <Text style={styles.label}>Date *</Text>
        <Pressable style={styles.dateBox} onPress={() => setPicking(true)} accessibilityRole="button" accessibilityLabel="Expense date">
          <Text style={text.body}>{date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</Text>
        </Pressable>
        {picking ? (
          <DateTimePicker
            value={date}
            mode="date"
            maximumDate={new Date()}
            onChange={(event, picked) => {
              setPicking(false);
              if (event.type !== 'dismissed' && picked) setDate(picked);
            }}
          />
        ) : null}
        {type === 'LOCAL' ? (
          <>
            <Field label="From *" value={f.fromPlace} onChangeText={set('fromPlace')} maxLength={150} />
            <Field label="To *" value={f.toPlace} onChangeText={set('toPlace')} maxLength={150} />
            <Field label="Mode (bike, auto, bus…)" value={f.mode} onChangeText={set('mode')} maxLength={60} />
            <Field label="Distance (km)" value={f.distanceKm} onChangeText={set('distanceKm')} keyboardType="decimal-pad" />
          </>
        ) : type === 'TOUR' ? (
          <>
            <Field label="Place visited *" value={f.placeVisited} onChangeText={set('placeVisited')} maxLength={150} />
            <ChipSelect label="Night stay" value={f.nightStay} options={YES_NO} onChange={(v) => v && set('nightStay')(v)} />
            {Array.from({ length: Math.ceil(TOUR_HEADS.length / 2) }, (_, i) => TOUR_HEADS.slice(i * 2, i * 2 + 2)).map((pair, i) => (
              <View key={i} style={styles.tourRow}>
                {pair.map((h) => (
                  <View key={h} style={styles.flex}>
                    <Field label={`${TOUR_HEAD_LABEL[h]} (₹)`} value={f[h]} onChangeText={set(h)} keyboardType="decimal-pad" />
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.tourTotal}>
              <Text style={text.muted}>Total (sum of the heads above)</Text>
              <Text style={styles.amount}>{formatINR(tourTotal)}</Text>
            </View>
          </>
        ) : (
          <>
            <Field label="Paid to *" value={f.paidTo} onChangeText={set('paidTo')} maxLength={150} />
            <ChipSelect label="Paid by" value={f.paymentMode} options={MODES} onChange={(v) => v && set('paymentMode')(v)} />
            <Field label="Reference / bill no." value={f.reference} onChangeText={set('reference')} maxLength={100} />
          </>
        )}
        {type !== 'TOUR' ? <Field label="Amount (₹) *" value={f.amount} onChangeText={set('amount')} keyboardType="decimal-pad" /> : null}
        <Field label="Purpose" value={f.purpose} onChangeText={set('purpose')} multiline maxLength={2000} />
        <Field label="Title (optional)" value={f.title} onChangeText={set('title')} maxLength={200} />
        <Button title="Save as Draft" onPress={submit} loading={create.isPending} />
        <Text style={[text.muted, styles.sub2]}>Next: add the bill photo and submit.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg },
  list: { padding: space.lg, flexGrow: 1 },
  flex: { flex: 1 },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  no: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  status: { fontSize: 12, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, marginVertical: 3 },
  amount: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  sub: { marginBottom: space.sm },
  sub2: { marginTop: space.sm, textAlign: 'center' },
  section: { marginBottom: space.sm },
  entry: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  photo: { marginBottom: space.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  dateBox: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, justifyContent: 'center', backgroundColor: colors.surface, marginBottom: space.md },
  tourRow: { flexDirection: 'row', gap: space.md },
  tourTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginBottom: space.md },
});
