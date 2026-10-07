import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CustomerPicker, type PickedCustomer } from '../components/CustomerPicker';
import { PdfButton } from '../components/docParts';
import { ChipSelect, DateField } from '../components/inputs';
import { Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dayFromIso, formatDate, isoDay } from '../lib/dates';
import { enumLabel } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import { MEETING_LABEL, type MeetingStatus, type MeetingType, type Paginated, type TourDetail, type TourMeeting, type TourSummary } from '../types';

const TONE: Record<string, string> = { PLANNED: colors.primaryDark, COMPLETED: colors.success, CANCELLED: colors.danger };
const MEETING_TYPES = (Object.keys(MEETING_LABEL) as MeetingType[]).map((value) => ({ value, label: MEETING_LABEL[value] }));

/** My tour / customer-meeting plans, newest first (everyone's for a role that sees every sales person — the server decides). */
export function ToursScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Tours'>) {
  const list = useQuery({ queryKey: ['tours', 'list'], queryFn: () => api.get<Paginated<TourSummary>>('/tours', { pageSize: 50 }) });
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('TourForm')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Plan a tour">
          <Text style={styles.headerBtn}>+ New</Text>
        </Pressable>
      ),
    });
  }, [navigation]);
  const items = list.data?.items ?? [];

  return (
    <View style={styles.screen}>
      {list.isError ? <View style={styles.pad}><ErrorBox message={list.error instanceof ApiError ? list.error.message : 'Could not load tour plans.'} /></View> : null}
      <FlatList
        data={items}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
        ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.pad} color={colors.primary} /> : <Empty title="No tour plans yet" hint="Tap + New to plan a tour." />}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('TourDetail', { id: item.id, no: item.planNo })} accessibilityRole="button">
            <View style={styles.row}>
              <Text style={styles.no}>{item.planNo}</Text>
              <Text style={[styles.status, { color: TONE[item.status] ?? colors.muted }]}>{enumLabel(item.status)}</Text>
            </View>
            <Text style={styles.name}>{item.location}</Text>
            <Text style={text.muted}>
              {formatDate(item.tourDate)}
              {item._count ? ` · ${item._count.meetings} meeting${item._count.meetings === 1 ? '' : 's'}` : ''} · {item.salesPerson.fullName}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const MEETING_STATUSES: Array<{ value: MeetingStatus; label: string }> = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'DONE', label: 'Done' },
  { value: 'POSTPONED', label: 'Postponed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
const TOUR_STATUSES: Array<{ value: TourSummary['status']; label: string }> = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
const opt = (v: string | null | undefined) => v?.trim() || undefined;

/**
 * A saved meeting as the server takes it back. Saving a tour replaces the whole plan, so every field of every meeting is
 * sent again — also the ones the app has no box for (interested in, expected discussion, senior, priority).
 */
function meetingBody(m: TourMeeting) {
  return {
    customerId: m.customer?.id,
    prospectName: opt(m.prospectName),
    contactName: opt(m.contactName),
    mobile: opt(m.mobile),
    location: opt(m.location),
    purpose: opt(m.purpose),
    meetingType: m.meetingType,
    interestedIn: opt(m.interestedIn),
    expectedDiscussion: opt(m.expectedDiscussion),
    seniorRequired: m.seniorRequired,
    seniorName: opt(m.seniorName),
    remarks: opt(m.remarks),
    priority: m.priority,
    status: m.status,
    discussion: opt(m.discussion),
  };
}
type MeetingBody = ReturnType<typeof meetingBody>;
const tourBody = (t: TourDetail, meetings: MeetingBody[]) => ({ tourDate: t.tourDate.slice(0, 10), location: t.location, purpose: opt(t.purpose), remarks: opt(t.remarks), status: t.status, meetings });

/** After the meeting: what was discussed and how it went. Saved on its own, without opening the whole plan for editing. */
function MeetingOutcome({ tour, meeting }: { tour: TourDetail; meeting: TourMeeting }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MeetingStatus>(meeting.status === 'PLANNED' ? 'DONE' : meeting.status);
  const [discussion, setDiscussion] = useState(meeting.discussion ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.patch<TourDetail>(`/tours/${tour.id}`, tourBody(tour, tour.meetings.map((m) => (m.id === meeting.id ? { ...meetingBody(m), status, discussion: opt(discussion) } : meetingBody(m))))),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['tours'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the discussion.'),
  });

  if (!open) return <Button title={meeting.discussion ? 'Edit Discussion' : 'Write Discussion'} variant="secondary" onPress={() => setOpen(true)} />;
  return (
    <View>
      {error ? <ErrorBox message={error} /> : null}
      <ChipSelect label="Meeting status" value={status} options={MEETING_STATUSES} onChange={(v) => v && setStatus(v)} />
      <Field label="What was discussed" value={discussion} onChangeText={setDiscussion} multiline maxLength={4000} />
      <Button title="Save Discussion" loading={save.isPending} onPress={() => save.mutate()} />
      <View style={styles.gap} />
      <Button title="Back" variant="secondary" onPress={() => setOpen(false)} />
    </View>
  );
}

export function TourDetailScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'TourDetail'>) {
  const q = useQuery({ queryKey: ['tours', 'one', route.params.id], queryFn: () => api.get<TourDetail>(`/tours/${route.params.id}`) });
  const t = q.data;
  const editable = t ? t.status !== 'CANCELLED' : false;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.pad} /> : null}
      {q.isError ? <ErrorBox message={q.error instanceof ApiError ? q.error.message : 'Could not load this tour plan.'} /> : null}
      {t ? (
        <>
          <Card>
            <View style={styles.row}>
              <Text style={[text.h1, styles.flex]}>{t.location}</Text>
              <Text style={[styles.status, { color: TONE[t.status] ?? colors.muted }]}>{enumLabel(t.status)}</Text>
            </View>
            <Text style={[text.muted, styles.sub]}>{t.planNo}</Text>
            <Row label="Date" value={formatDate(t.tourDate)} />
            <Row label="Sales person" value={t.salesPerson.fullName} />
            <Row label="Purpose" value={t.purpose} />
            <Row label="Remarks" value={t.remarks} />
            <PdfButton path={`/tours/${t.id}/pdf`} fileName={t.planNo} title={`Tour report ${t.planNo}`} />
            {editable ? (
              <>
                <View style={styles.gap} />
                <Button title="Edit Plan" variant="secondary" onPress={() => navigation.navigate('TourForm', { id: t.id })} />
              </>
            ) : null}
          </Card>
          {t.meetings.map((m, i) => (
            // Saving replaces the meetings on the server (new ids), which also resets each card's discussion box.
            <Card key={m.id}>
              <Text style={text.h2}>
                {i + 1}. {m.customer?.name ?? m.prospectName ?? 'Meeting'}
              </Text>
              <Text style={[text.muted, styles.sub]}>
                {MEETING_LABEL[m.meetingType]}
                {m.customer ? '' : ' · Prospect'} · {enumLabel(m.status)}
              </Text>
              <Row label="Contact" value={m.contactName} />
              <Row label="Mobile" value={m.mobile} />
              <Row label="Place" value={m.location} />
              <Row label="Purpose" value={m.purpose} />
              <Row label="Interested in" value={m.interestedIn} />
              <Row label="To discuss" value={m.expectedDiscussion} />
              <Row label="Senior to join" value={m.seniorRequired ? (m.seniorName ?? 'Yes') : null} />
              <Row label="Discussion" value={m.discussion} />
              {m.mobile ? (
                <View style={styles.gap}>
                  <Button title="Call" variant="secondary" onPress={() => void Linking.openURL(`tel:${m.mobile!.replace(/[^\d+]/g, '')}`)} />
                </View>
              ) : null}
              {editable ? (
                <>
                  <View style={styles.gap} />
                  <MeetingOutcome tour={t} meeting={m} />
                </>
              ) : null}
            </Card>
          ))}
          {!editable ? <Text style={[text.muted, styles.foot]}>This tour is cancelled and can no longer be changed.</Text> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

interface MeetingDraft {
  key: string;
  customer: PickedCustomer | null;
  prospectName: string;
  contactName: string;
  mobile: string;
  purpose: string;
  meetingType: MeetingType;
  status: MeetingStatus;
  discussion: string;
  /** The saved meeting this draft came from, so the fields the form has no box for are sent back unchanged. */
  saved?: TourMeeting;
}
let seq = 0;
const newMeeting = (): MeetingDraft => ({ key: `m${++seq}`, customer: null, prospectName: '', contactName: '', mobile: '', purpose: '', meetingType: 'SALES_VISIT', status: 'PLANNED', discussion: '' });
const draftOf = (m: TourMeeting): MeetingDraft => ({
  key: `m${++seq}`,
  customer: m.customer ? { id: m.customer.id, name: m.customer.name } : null,
  prospectName: m.prospectName ?? '',
  contactName: m.contactName ?? '',
  mobile: m.mobile ?? '',
  purpose: m.purpose ?? '',
  meetingType: m.meetingType,
  status: m.status,
  discussion: m.discussion ?? '',
  saved: m,
});

/** Plan a tour — date, place, and the customers (or not-yet-customers, by name) to meet — or change a saved plan. */
export function TourFormScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'TourForm'>) {
  const id = route.params?.id;
  const qc = useQueryClient();
  const [date, setDate] = useState<Date>(() => new Date());
  const [location, setLocation] = useState('');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState<TourSummary['status']>('PLANNED');
  const [meetings, setMeetings] = useState<MeetingDraft[]>(() => [newMeeting()]);
  const [error, setError] = useState<string | null>(null);
  const setMeeting = (key: string, patch: Partial<MeetingDraft>) => setMeetings((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  // Editing: fill the form once from the saved plan.
  const existing = useQuery({ queryKey: ['tours', 'one', id], queryFn: () => api.get<TourDetail>(`/tours/${id}`), enabled: Boolean(id) });
  const filled = useRef(false);
  useEffect(() => {
    const t = existing.data;
    if (!t || filled.current) return;
    filled.current = true;
    setDate(dayFromIso(t.tourDate) ?? new Date());
    setLocation(t.location);
    setPurpose(t.purpose ?? '');
    setRemarks(t.remarks ?? '');
    setStatus(t.status);
    setMeetings(t.meetings.map(draftOf));
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        tourDate: isoDay(date),
        location: location.trim(),
        purpose: opt(purpose),
        meetings: meetings.map((m) => ({
          ...(m.saved ? meetingBody(m.saved) : {}),
          customerId: m.customer?.id,
          prospectName: m.customer ? opt(m.saved?.prospectName) : opt(m.prospectName),
          contactName: opt(m.contactName),
          mobile: opt(m.mobile),
          purpose: opt(m.purpose),
          meetingType: m.meetingType,
          ...(id ? { status: m.status, discussion: opt(m.discussion) } : {}),
        })),
      };
      return id ? api.patch<TourDetail>(`/tours/${id}`, { ...body, remarks: opt(remarks), status }) : api.post<TourDetail>('/tours', body);
    },
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: ['tours'] });
      if (id) navigation.goBack();
      else navigation.replace('TourDetail', { id: t.id, no: t.planNo });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the tour plan.'),
  });

  function submit() {
    if (location.trim().length < 2) return setError('Enter the tour location.');
    const bad = meetings.findIndex((m) => !m.customer && !m.prospectName.trim());
    if (bad >= 0) return setError(`Meeting ${bad + 1}: choose a customer or type the name of the prospect.`);
    setError(null);
    if (id && status === 'CANCELLED') {
      Alert.alert('Cancel this tour?', 'A cancelled tour cannot be changed again.', [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, cancel the tour', style: 'destructive', onPress: () => save.mutate() },
      ]);
      return;
    }
    save.mutate();
  }

  if (id && !existing.data) {
    return <View style={[styles.screen, styles.pad]}>{existing.isError ? <ErrorBox message={existing.error instanceof ApiError ? existing.error.message : 'Could not load this tour plan.'} /> : <ActivityIndicator color={colors.primary} style={styles.pad} />}</View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <DateField label="Tour date *" value={date} onChange={(d) => d && setDate(d)} />
        <Field label="Location * (city / area)" value={location} onChangeText={setLocation} maxLength={200} />
        <Field label="Purpose" value={purpose} onChangeText={setPurpose} multiline maxLength={2000} />
        {id ? (
          <>
            <Field label="Remarks" value={remarks} onChangeText={setRemarks} multiline maxLength={2000} />
            <ChipSelect label="Tour status" value={status} options={TOUR_STATUSES} onChange={(v) => v && setStatus(v)} />
          </>
        ) : null}
      </Card>

      {meetings.map((m, i) => (
        <Card key={m.key}>
          <View style={styles.row}>
            <Text style={[text.h2, styles.flex]}>Meeting {i + 1}</Text>
            {meetings.length > 1 ? (
              <Pressable onPress={() => setMeetings((ms) => ms.filter((x) => x.key !== m.key))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove meeting ${i + 1}`}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.gap} />
          <CustomerPicker label="Customer" required={false} value={m.customer} onChange={(c) => setMeeting(m.key, { customer: c })} />
          {!m.customer ? <Field label="…or prospect name (not yet a customer)" value={m.prospectName} onChangeText={(v) => setMeeting(m.key, { prospectName: v })} maxLength={200} /> : null}
          <Field label="Contact person" value={m.contactName} onChangeText={(v) => setMeeting(m.key, { contactName: v })} maxLength={150} />
          <Field label="Mobile" value={m.mobile} onChangeText={(v) => setMeeting(m.key, { mobile: v })} keyboardType="phone-pad" maxLength={20} />
          <ChipSelect label="Meeting type *" value={m.meetingType} options={MEETING_TYPES} onChange={(v) => v && setMeeting(m.key, { meetingType: v })} />
          <Field label="Purpose" value={m.purpose} onChangeText={(v) => setMeeting(m.key, { purpose: v })} multiline maxLength={2000} />
          {id ? (
            <>
              <ChipSelect label="Meeting status" value={m.status} options={MEETING_STATUSES} onChange={(v) => v && setMeeting(m.key, { status: v })} />
              <Field label="What was discussed (after the meeting)" value={m.discussion} onChangeText={(v) => setMeeting(m.key, { discussion: v })} multiline maxLength={4000} />
            </>
          ) : null}
        </Card>
      ))}
      <Button title="+ Add another meeting" variant="secondary" onPress={() => setMeetings((ms) => [...ms, newMeeting()])} />
      <View style={styles.gap} />
      <Button title={id ? 'Save Changes' : 'Save Tour Plan'} onPress={submit} loading={save.isPending} />
      <View style={styles.gap} />
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
  sub: { marginBottom: space.sm },
  gap: { height: space.sm },
  foot: { textAlign: 'center', marginBottom: space.lg },
  remove: { color: colors.danger, fontWeight: '700', fontSize: 13 },
});
