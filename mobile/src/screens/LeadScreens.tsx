import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, DateField, DateTimeField, Segmented } from '../components/inputs';
import { Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { scanBusinessCard } from '../lib/cardScan';
import { dayFromIso, formatDate, isoDay, pickedParts } from '../lib/dates';
import { formatINR } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';

/** The same stages, sources and activity kinds as the web CRM's Leads module. */
const STAGES = ['New Enquiry', 'Site Survey', 'Quotation Sent', 'Negotiation', 'Won', 'Lost'];
const SOURCES = ['Website', 'Referral', 'Partner', 'Trade fair', 'Other'];
const ACTIVITY_TYPES = ['Follow-up', 'Call', 'Site Survey', 'Quote Review', 'Customer Meeting', 'Other'];
const ACTIVITY_STATUSES = ['Open', 'Completed', 'Cancelled'];
const options = (values: string[]) => values.map((v) => ({ value: v, label: v }));
const STAGE_TONE: Record<string, string> = { 'New Enquiry': colors.danger, 'Site Survey': colors.warning, 'Quotation Sent': colors.primaryDark, Negotiation: '#6b3fa8', Won: colors.success, Lost: colors.muted };
const STATUS_TONE: Record<string, string> = { Open: colors.warning, Overdue: colors.danger, Completed: colors.success, Cancelled: colors.muted };
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface Person {
  id: string;
  fullName: string;
}
export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  source: string;
  stage: string;
  value: number;
  owner: Person | null;
  follow: string | null;
  location: string | null;
  requirement: string | null;
  remark: string | null;
  campaign: { id: string; name: string; channel: string } | null;
}
export interface LeadActivity {
  id: string;
  type: string;
  subject: string;
  dueDate: string;
  time: string | null;
  lead: { id: string; name: string; company: string } | null;
  customer: { id: string; name: string } | null;
  owner: Person | null;
  status: string;
  details: string | null;
}
export interface LeadList {
  items: Lead[];
  summary: { total: number; open: number; openValue: number; dueToday: number };
}
export interface Schedule {
  today: string;
  items: LeadActivity[];
  summary: { open: number; overdue: number; dueToday: number; completed: number };
}
interface Overview {
  metrics: { total: number; open: number; openValue: number; won: number; lost: number };
  pipeline: Array<{ stage: string; count: number; amount: number; sharePercent: number }>;
  todayItems: LeadActivity[];
  upcoming: LeadActivity[];
}

export const useLeads = (enabled = true) => useQuery({ queryKey: ['leads', 'list'], queryFn: () => api.get<LeadList>('/leads'), enabled });
export const useSchedule = (enabled = true) => useQuery({ queryKey: ['leads', 'activities'], queryFn: () => api.get<Schedule>('/lead-activities'), enabled });
const linkLabel = (a: LeadActivity) => (a.lead ? `${a.lead.company} · ${a.lead.name}` : a.customer ? a.customer.name : null);
type Tab = 'leads' | 'schedule' | 'pipeline';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'leads', label: 'Leads' },
  { value: 'schedule', label: 'Follow-ups & Schedule' },
  { value: 'pipeline', label: 'Sales Pipeline' },
];

/** Leads, their follow-up schedule and the sales pipeline — the web CRM's Leads module on the phone (CSV import stays on the web). */
export function LeadsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Leads'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('lead.manage');
  const [tab, setTab] = useState<Tab>('leads');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage
        ? () => (
            <Pressable onPress={() => (tab === 'schedule' ? navigation.navigate('LeadActivityForm', {}) : navigation.navigate('LeadForm', {}))} hitSlop={12} accessibilityRole="button" accessibilityLabel={tab === 'schedule' ? 'Add follow-up or event' : 'Add lead'}>
              <Text style={styles.headerBtn}>{tab === 'schedule' ? '+ Event' : '+ Lead'}</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canManage, tab]);

  return (
    <View style={styles.screen}>
      <View>
        <Segmented value={tab} options={TABS} onChange={setTab} />
      </View>
      {tab === 'leads' ? <LeadList onOpen={(id) => navigation.navigate('LeadDetail', { id })} /> : null}
      {tab === 'schedule' ? <ScheduleList canManage={canManage} onOpen={canManage ? (id) => navigation.navigate('LeadActivityForm', { id }) : undefined} /> : null}
      {tab === 'pipeline' ? <Pipeline /> : null}
    </View>
  );
}

function LeadList({ onOpen }: { onOpen?: (id: string) => void }) {
  const { hasPermission } = useAuth();
  const canAddCustomer = hasPermission('customer.manage');
  const qc = useQueryClient();
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const list = useLeads();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  const today = isoDay(new Date());
  const rows = list.data?.items ?? [];
  const convert = useMutation({
    mutationFn: (l: Lead) => (l.stage === 'Won' ? Promise.resolve() : api.patch(`/leads/${l.id}`, { stage: 'Won' })),
    onSuccess: (_, l) => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      navigation.navigate('Customers', { screen: 'CustomerForm', params: { fromLead: { name: l.company, contactName: l.name, phone: l.phone ?? undefined, email: l.email ?? undefined } } });
    },
  });
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((l) => (!stage || l.stage === stage) && (!q || [l.name, l.company, l.phone, l.email, l.owner?.fullName].some((v) => v?.toLowerCase().includes(q))));
  }, [rows, search, stage]);
  const s = list.data?.summary;
  return (
    <FlatList
      data={shown}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      ListHeaderComponent={
        <View>
          {list.isError ? <ErrorBox message={errorText(list.error, 'Could not load the leads.')} /> : null}
          {s ? (
            <View style={styles.stats}>
              <Stat label="Total leads" value={String(s.total)} />
              <Stat label="Open leads" value={String(s.open)} />
              <Stat label="Open pipeline" value={formatINR(s.openValue)} />
              <Stat label="Due today" value={String(s.dueToday)} tone={s.dueToday > 0 ? colors.warning : undefined} />
            </View>
          ) : null}
          <Field label="Search" value={search} onChangeText={setSearch} placeholder="Search leads..." />
          <ChipSelect label="Stage" value={stage} options={options(STAGES)} onChange={setStage} allowClear />
        </View>
      }
      ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title={rows.length ? 'No leads match this search' : 'No leads yet'} hint={rows.length ? undefined : 'Add an enquiry to start your pipeline.'} />}
      renderItem={({ item }) => {
        const late = !!item.follow && item.follow < today && !['Won', 'Lost'].includes(item.stage);
        return (
          <View style={styles.item}>
            <Pressable style={({ pressed }) => pressed && styles.pressed} disabled={!onOpen} onPress={() => onOpen?.(item.id)} accessibilityRole="button">
              <View style={styles.itemHead}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[styles.tag, { color: STAGE_TONE[item.stage] ?? colors.muted }]}>{item.stage}</Text>
              </View>
              <Text style={styles.meta}>
                {item.company} · {item.source}
              </Text>
              <Text style={styles.when}>{formatINR(item.value)}</Text>
              <Text style={[styles.meta, late && { color: colors.danger, fontWeight: '700' }]}>
                Next follow-up: {item.follow ? formatDate(item.follow) : '—'} · {item.owner?.fullName ?? 'Unassigned'}
              </Text>
            </Pressable>
            {canAddCustomer && item.stage !== 'Lost' ? (
              <View style={styles.rowAction}>
                <Button
                  title={item.stage === 'Won' ? 'Create Customer' : 'Convert to Customer'}
                  variant="secondary"
                  loading={convert.isPending && convert.variables?.id === item.id}
                  disabled={convert.isPending}
                  onPress={() => convert.mutate(item)}
                />
              </View>
            ) : null}
          </View>
        );
      }}
    />
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function ActivityRow({ a, today, onOpen, action }: { a: LeadActivity; today: string; onOpen?: () => void; action?: React.ReactNode }) {
  const status = a.status === 'Open' && a.dueDate < today ? 'Overdue' : a.status;
  return (
    <Pressable style={({ pressed }) => [styles.item, status === 'Overdue' && styles.itemLate, pressed && styles.pressed]} disabled={!onOpen} onPress={onOpen} accessibilityRole="button">
      <View style={styles.itemHead}>
        <Text style={styles.name} numberOfLines={2}>
          {a.subject}
        </Text>
        <Text style={[styles.tag, { color: STATUS_TONE[status] ?? colors.muted }]}>{status}</Text>
      </View>
      <Text style={styles.when}>
        {formatDate(a.dueDate)} · {a.time ?? '—'} · {a.type}
      </Text>
      {linkLabel(a) ? <Text style={styles.meta}>{linkLabel(a)}</Text> : null}
      <Text style={styles.meta}>Assigned to {a.owner?.fullName ?? 'Unassigned'}</Text>
      {a.details ? (
        <Text style={styles.meta} numberOfLines={2}>
          {a.details}
        </Text>
      ) : null}
      {action}
    </Pressable>
  );
}

function ScheduleList({ canManage, onOpen }: { canManage: boolean; onOpen?: (id: string) => void }) {
  const qc = useQueryClient();
  const list = useSchedule();
  const [error, setError] = useState<string | null>(null);
  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/lead-activities/${id}`, { status: 'Completed' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['leads'] }),
    onError: (err) => setError(errorText(err, 'Could not mark it completed.')),
  });
  const today = list.data?.today ?? isoDay(new Date());
  const s = list.data?.summary;
  return (
    <FlatList
      data={list.data?.items ?? []}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}
      ListHeaderComponent={
        <View>
          {list.isError ? <ErrorBox message={errorText(list.error, 'Could not load the schedule.')} /> : null}
          {error ? <ErrorBox message={error} /> : null}
          {s ? (
            <View style={styles.stats}>
              <Stat label="Open" value={String(s.open)} />
              <Stat label="Overdue" value={String(s.overdue)} tone={s.overdue > 0 ? colors.danger : colors.success} />
              <Stat label="Due today" value={String(s.dueToday)} tone={s.dueToday > 0 ? colors.warning : undefined} />
              <Stat label="Completed" value={String(s.completed)} />
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={list.isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <Empty title="No scheduled activities" hint="Add a follow-up or event to build your sales schedule." />}
      renderItem={({ item }) => (
        <ActivityRow
          a={item}
          today={today}
          onOpen={onOpen ? () => onOpen(item.id) : undefined}
          action={
            canManage && item.status === 'Open' ? (
              <View style={styles.rowAction}>
                <Button title="Mark Completed" variant="secondary" loading={complete.isPending && complete.variables === item.id} disabled={complete.isPending} onPress={() => complete.mutate(item.id)} />
              </View>
            ) : null
          }
        />
      )}
    />
  );
}

function Pipeline() {
  const q = useQuery({ queryKey: ['leads', 'overview'], queryFn: () => api.get<Overview>('/leads/overview') });
  const o = q.data;
  const today = isoDay(new Date());
  if (q.isLoading) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (!o) return <View style={styles.list}><ErrorBox message={errorText(q.error, 'Could not load the sales pipeline.')} /></View>;
  const max = Math.max(1, ...o.pipeline.map((p) => p.count));
  return (
    <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <View style={styles.stats}>
        <Stat label="Total leads" value={String(o.metrics.total)} />
        <Stat label="Open pipeline" value={formatINR(o.metrics.openValue)} tone={colors.warning} />
        <Stat label="Won leads" value={String(o.metrics.won)} tone={colors.success} />
        <Stat label="Lost leads" value={String(o.metrics.lost)} tone={o.metrics.lost > 0 ? colors.danger : undefined} />
      </View>
      <Card>
        <Text style={[text.h2, styles.section]}>Sales pipeline</Text>
        {o.pipeline.map((p) => (
          <View key={p.stage} style={styles.pipeRow}>
            <View style={styles.pipeHead}>
              <Text style={styles.pipeName}>
                {p.stage} · {p.count}
              </Text>
              <Text style={styles.pipeAmount}>{formatINR(p.amount)}</Text>
            </View>
            <View style={styles.rail}>
              <View style={[styles.fill, { width: `${p.count ? Math.max(4, (p.count / max) * 100) : 0}%`, backgroundColor: STAGE_TONE[p.stage] ?? colors.primary }]} />
            </View>
          </View>
        ))}
      </Card>
      <Text style={[text.h2, styles.section]}>Today’s follow-ups</Text>
      {o.todayItems.length === 0 ? <Empty title="No follow-ups due today" /> : o.todayItems.map((a) => <ActivityRow key={a.id} a={a} today={today} />)}
      <Text style={[text.h2, styles.section]}>Upcoming schedule</Text>
      {o.upcoming.length === 0 ? <Empty title="Schedule is clear" /> : o.upcoming.map((a) => <ActivityRow key={a.id} a={a} today={today} />)}
    </ScrollView>
  );
}

// ------------------------------------------------------------------ lead detail

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');
/** WhatsApp needs the country code; an Indian 10-digit mobile gets 91 in front. */
const whatsappNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `91${d}` : d;
};

function LeadContactActions({ phone }: { phone: string }) {
  return (
    <View style={styles.actions}>
      <Pressable style={[styles.action, { backgroundColor: colors.primarySoft }]} onPress={() => void Linking.openURL(`tel:${digits(phone)}`)} accessibilityRole="button" accessibilityLabel={`Call ${phone}`}>
        <Text style={[styles.actionText, { color: colors.primaryDark }]}>Call</Text>
      </Pressable>
      <Pressable style={[styles.action, { backgroundColor: colors.successSoft }]} onPress={() => void Linking.openURL(`https://wa.me/${whatsappNumber(phone)}`)} accessibilityRole="button" accessibilityLabel={`WhatsApp ${phone}`}>
        <Text style={[styles.actionText, { color: colors.success }]}>WhatsApp</Text>
      </Pressable>
    </View>
  );
}

/** One lead: identity, call/WhatsApp, details, requirement/remark and its follow-up schedule. Edit and Convert to Customer for roles that may; Documents/Notes from the mockup have no backend data to show yet, so they're left off rather than faked. */
export function LeadDetailScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'LeadDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const navToCustomer = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const canManage = hasPermission('lead.manage');
  const canAddCustomer = hasPermission('customer.manage');
  const list = useLeads();
  const schedule = useSchedule();
  const lead = list.data?.items.find((l) => l.id === id);
  const followUps = (schedule.data?.items ?? []).filter((a) => a.lead?.id === id);
  const today = schedule.data?.today ?? isoDay(new Date());

  const convert = useMutation({
    mutationFn: () => (lead!.stage === 'Won' ? Promise.resolve() : api.patch(`/leads/${lead!.id}`, { stage: 'Won' })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      navToCustomer.navigate('Customers', { screen: 'CustomerForm', params: { fromLead: { name: lead!.company, contactName: lead!.name, phone: lead!.phone ?? undefined, email: lead!.email ?? undefined } } });
    },
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage
        ? () => (
            <Pressable onPress={() => navigation.navigate('LeadForm', { id })} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit lead">
              <Text style={styles.headerBtn}>Edit</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canManage, id]);

  if (list.isLoading) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (!lead) return <View style={styles.list}><ErrorBox message={errorText(list.error, 'This lead could not be found.')} /></View>;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={list.isRefetching || schedule.isRefetching}
          onRefresh={() => {
            void list.refetch();
            void schedule.refetch();
          }}
        />
      }
    >
      <Card>
        <View style={styles.itemHead}>
          <Text style={[text.h1, { flex: 1 }]}>{lead.name}</Text>
          <Text style={[styles.tag, { color: STAGE_TONE[lead.stage] ?? colors.muted }]}>{lead.stage}</Text>
        </View>
        <Text style={text.muted}>{lead.company}</Text>
        {lead.phone ? <LeadContactActions phone={lead.phone} /> : null}
        {canAddCustomer && lead.stage !== 'Lost' ? (
          <View style={styles.plan}>
            <Button title={lead.stage === 'Won' ? 'Create Customer' : 'Convert to Customer'} variant="secondary" loading={convert.isPending} onPress={() => convert.mutate()} />
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={[text.h2, styles.section]}>Details</Text>
        <Row label="Source" value={lead.source} />
        <Row label="Owner" value={lead.owner?.fullName ?? 'Unassigned'} />
        <Row label="Email" value={lead.email} />
        <Row label="Phone" value={lead.phone} />
        <Row label="Deal value" value={formatINR(lead.value)} />
        <Row label="Location" value={lead.location} />
        <Row label="Campaign" value={lead.campaign?.name} />
        <Row label="Next follow-up" value={lead.follow ? formatDate(lead.follow) : null} />
      </Card>

      {lead.requirement ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Requirement</Text>
          <Text style={text.body}>{lead.requirement}</Text>
        </Card>
      ) : null}

      {lead.remark ? (
        <Card>
          <Text style={[text.h2, styles.section]}>Remark</Text>
          <Text style={text.body}>{lead.remark}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={[text.h2, styles.section]}>Follow-ups & activity</Text>
        {schedule.isError ? <ErrorBox message={errorText(schedule.error, 'Could not load the follow-up schedule.')} /> : null}
        {followUps.length === 0 ? <Empty title="No scheduled activity for this lead" /> : followUps.map((a) => <ActivityRow key={a.id} a={a} today={today} />)}
      </Card>
    </ScrollView>
  );
}

// ------------------------------------------------------------------ lead form

/** Add or edit a lead; with the rights for it, transfer it to another employee or delete it. */
export function LeadFormScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'LeadForm'>) {
  const id = route.params?.id;
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const list = useLeads(!!id);
  const lead = id ? list.data?.items.find((l) => l.id === id) : undefined;
  if (id && list.isLoading) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (id && !lead) return <View style={styles.list}><ErrorBox message={errorText(list.error, 'This lead could not be found.')} /></View>;
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['leads'] });
    navigation.goBack();
  };
  return <LeadFormBody key={lead?.id ?? 'new'} lead={lead} onDone={done} canDelete={hasPermission('lead.delete')} canTransfer={hasPermission('lead.transfer')} />;
}

function LeadFormBody({ lead, onDone, canDelete, canTransfer }: { lead?: Lead; onDone: () => void; canDelete: boolean; canTransfer: boolean }) {
  const { hasPermission } = useAuth();
  const [name, setName] = useState(lead?.name ?? '');
  const [company, setCompany] = useState(lead?.company ?? '');
  const [email, setEmail] = useState(lead?.email ?? '');
  const [phone, setPhone] = useState(lead?.phone ?? '');
  const [source, setSource] = useState<string | null>(lead?.source ?? SOURCES[0]!);
  const [stage, setStage] = useState<string | null>(lead?.stage ?? STAGES[0]!);
  const [value, setValue] = useState(String(lead?.value ?? ''));
  const [follow, setFollow] = useState<Date | null>(dayFromIso(lead?.follow));
  const [campaignId, setCampaignId] = useState<string | null>(lead?.campaign?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [toOwner, setToOwner] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const navigation = useNavigation<NavigationProp<MoreStackParams>>();
  const owners = useQuery({ queryKey: ['leads', 'owners'], queryFn: () => api.get<Person[]>('/leads/owners'), enabled: transferring });
  const canSeeCampaigns = hasPermission('marketing.read');
  const campaigns = useQuery({
    queryKey: ['campaigns', 'options'],
    queryFn: () => api.get<Array<{ id: string; name: string; channel: string }>>('/marketing-campaigns/options'),
    enabled: canSeeCampaigns,
  });
  const campaignOptions = (campaigns.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const sourceOptions = options(lead && !SOURCES.includes(lead.source) ? [...SOURCES, lead.source] : SOURCES);

  function openCardScan() {
    setError(null);
    navigation.navigate('CardScan', {
      onScanned: (card) => {
        if (card.name) setName(card.name);
        if (card.company) setCompany(card.company);
        if (card.phones[0]) setPhone(card.phones[0].replace(/^\+91/, '').replace(/^\+/, ''));
        if (card.emails[0]) setEmail(card.emails[0]);
      },
    });
  }

  const save = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), company: company.trim(), email: email.trim(), phone: phone.trim(), source: source ?? undefined, stage: stage ?? undefined, value: Number(value.replace(/[^\d.]/g, '') || 0), follow: follow ? isoDay(follow) : '', ...(canSeeCampaigns ? { campaignId: campaignId ?? null } : {}) };
      return lead ? api.patch(`/leads/${lead.id}`, data) : api.post('/leads', data);
    },
    onSuccess: onDone,
    onError: (err) => setError(errorText(err, 'Could not save the lead.')),
  });
  const transfer = useMutation({
    mutationFn: () => api.post(`/leads/${lead!.id}/transfer`, { toOwnerId: toOwner, reason: reason.trim() || undefined }),
    onSuccess: onDone,
    onError: (err) => setError(errorText(err, 'Could not transfer the lead.')),
  });
  const remove = useMutation({ mutationFn: () => api.delete(`/leads/${lead!.id}`), onSuccess: onDone, onError: (err) => setError(errorText(err, 'Could not delete the lead.')) });

  function submit() {
    if (!name.trim()) return setError('Enter the contact name.');
    if (!company.trim()) return setError('Enter the company.');
    setError(null);
    save.mutate();
  }
  const busy = save.isPending || transfer.isPending || remove.isPending;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <View style={styles.scanBlock}>
          <Button title="Scan Visiting Card" variant="secondary" onPress={openCardScan} />
          <Text style={[text.muted, styles.hint]}>Reads the card on the phone, then fills in the fields below for you to check.</Text>
        </View>
        <Field label="Contact name *" value={name} onChangeText={setName} maxLength={200} />
        <Field label="Company *" value={company} onChangeText={setCompany} maxLength={200} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" maxLength={200} />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} />
        <ChipSelect label="Lead source" value={source} options={sourceOptions} onChange={(v) => v && setSource(v)} />
        {canSeeCampaigns && campaignOptions.length > 0 ? <ChipSelect label="Marketing campaign" value={campaignId} options={campaignOptions} onChange={setCampaignId} allowClear /> : null}
        <ChipSelect label="Sales stage" value={stage} options={options(STAGES)} onChange={(v) => v && setStage(v)} />
        <Field label="Estimated deal value (₹)" value={value} onChangeText={setValue} keyboardType="numeric" />
        <DateField label="Next follow-up" value={follow} onChange={setFollow} allowClear />
        <Text style={[text.muted, styles.hint]}>A follow-up is put on the schedule for this date (10:00). It goes when the date is cleared or the lead is Won / Lost.</Text>
        <Button title={lead ? 'Save Lead' : 'Create Lead'} onPress={submit} loading={save.isPending} disabled={busy} />
      </Card>

      {lead ? (
        <Card>
          <Row label="Owner" value={lead.owner?.fullName ?? 'Unassigned'} />
          {canTransfer ? (
            transferring ? (
              <>
                {owners.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
                <ChipSelect label="Transfer to *" value={toOwner} options={(owners.data ?? []).filter((o) => o.id !== lead.owner?.id).map((o) => ({ value: o.id, label: o.fullName }))} onChange={setToOwner} />
                <Field label="Reason" value={reason} onChangeText={setReason} maxLength={1000} multiline />
                <Button title="Transfer Lead" onPress={() => transfer.mutate()} loading={transfer.isPending} disabled={!toOwner || busy} />
                <View style={styles.gap} />
                <Button title="Back" variant="secondary" onPress={() => setTransferring(false)} />
              </>
            ) : (
              <Button title="Transfer to Another Employee" variant="secondary" disabled={busy} onPress={() => setTransferring(true)} />
            )
          ) : null}
          {canDelete ? (
            <>
              <View style={styles.gap} />
              <Button
                title="Delete Lead"
                variant="danger"
                loading={remove.isPending}
                disabled={busy}
                onPress={() =>
                  Alert.alert('Delete this lead?', `${lead.name} · ${lead.company}\nIts generated follow-up is removed too.`, [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
                  ])
                }
              />
            </>
          ) : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

// ------------------------------------------------------------------ activity form

/** Schedule or edit a follow-up, call, site survey, quote review or customer meeting. */
export function LeadActivityFormScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'LeadActivityForm'>) {
  const id = route.params?.id;
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const list = useSchedule(!!id);
  const activity = id ? list.data?.items.find((a) => a.id === id) : undefined;
  if (id && list.isLoading) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (id && !activity) return <View style={styles.list}><ErrorBox message={errorText(list.error, 'This activity could not be found.')} /></View>;
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['leads'] });
    navigation.goBack();
  };
  return <ActivityFormBody key={activity?.id ?? 'new'} activity={activity} onDone={done} canDelete={hasPermission('lead.delete')} />;
}

function whenOf(a?: LeadActivity): Date {
  const day = dayFromIso(a?.dueDate) ?? new Date();
  const [h, m] = (a?.time ?? '10:00').split(':').map(Number);
  day.setHours(h ?? 10, m ?? 0, 0, 0);
  return day;
}

function ActivityFormBody({ activity, onDone, canDelete }: { activity?: LeadActivity; onDone: () => void; canDelete: boolean }) {
  const leads = useLeads();
  const [type, setType] = useState<string | null>(activity?.type ?? ACTIVITY_TYPES[0]!);
  const [subject, setSubject] = useState(activity?.subject ?? '');
  const [when, setWhen] = useState(() => whenOf(activity));
  const [leadId, setLeadId] = useState<string | null>(activity?.lead?.id ?? null);
  const [status, setStatus] = useState<string | null>(activity?.status ?? 'Open');
  const [details, setDetails] = useState(activity?.details ?? '');
  const [error, setError] = useState<string | null>(null);
  const leadOptions = (leads.data?.items ?? []).map((l) => ({ value: l.id, label: `${l.name} · ${l.company}` }));

  const save = useMutation({
    mutationFn: () => {
      const { date, time } = pickedParts(when);
      const data = { type, subject: subject.trim(), dueDate: date, time, leadId, status: status ?? 'Open', details: details.trim() };
      return activity ? api.patch(`/lead-activities/${activity.id}`, data) : api.post('/lead-activities', data);
    },
    onSuccess: onDone,
    onError: (err) => setError(errorText(err, 'Could not save the activity.')),
  });
  const remove = useMutation({ mutationFn: () => api.delete(`/lead-activities/${activity!.id}`), onSuccess: onDone, onError: (err) => setError(errorText(err, 'Could not delete the activity.')) });
  function submit() {
    if (!subject.trim()) return setError('Enter the subject.');
    setError(null);
    save.mutate();
  }
  const busy = save.isPending || remove.isPending;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <ChipSelect label="Activity type *" value={type} options={options(ACTIVITY_TYPES)} onChange={(v) => v && setType(v)} />
        <Field label="Subject *" value={subject} onChangeText={setSubject} maxLength={500} placeholder="e.g. Discuss proposal with customer" />
        <DateTimeField label="Date and time *" value={when} onChange={setWhen} />
        <ChipSelect label="Linked lead" value={leadId} options={leadOptions} onChange={setLeadId} allowClear />
        {activity?.customer ? <Row label="Linked customer" value={activity.customer.name} /> : null}
        <ChipSelect label="Status" value={status} options={options(ACTIVITY_STATUSES)} onChange={(v) => v && setStatus(v)} />
        <Field label="Notes" value={details} onChangeText={setDetails} maxLength={4000} multiline placeholder="Add a short note or outcome" />
        <Button title={activity ? 'Save Activity' : 'Add to Schedule'} onPress={submit} loading={save.isPending} disabled={busy} />
        {activity && canDelete ? (
          <>
            <View style={styles.gap} />
            <Button
              title="Delete Activity"
              variant="danger"
              loading={remove.isPending}
              disabled={busy}
              onPress={() =>
                Alert.alert('Delete this scheduled activity?', activity.subject, [
                  { text: 'Keep', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
                ])
              }
            />
          </>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerBtn: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, flexGrow: 1 },
  loading: { padding: space.xl },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  stat: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 11.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.sm },
  itemLate: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  pressed: { opacity: 0.75 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  tag: { fontSize: 12, fontWeight: '700' },
  when: { fontSize: 13.5, fontWeight: '600', color: colors.text, marginTop: 2 },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rowAction: { marginTop: space.sm },
  section: { marginBottom: space.md, marginTop: space.sm },
  pipeRow: { marginBottom: space.md },
  pipeHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  pipeName: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  pipeAmount: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  rail: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 999 },
  hint: { marginBottom: space.md },
  gap: { height: space.sm },
  scanBlock: { marginBottom: space.md, gap: space.sm },
  plan: { marginTop: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  action: { flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700' },
});
