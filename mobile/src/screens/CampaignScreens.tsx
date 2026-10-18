import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ChipSelect, DateField, Segmented } from '../components/inputs';
import { Badge, Button, Card, Empty, ErrorBox, Field, Row, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dayFromIso, formatDate, isoDay } from '../lib/dates';
import { enumLabel, formatINR } from '../lib/format';
import type { MoreStackParams } from '../navigation';
import { colors, radius, space } from '../theme';
import type { Paginated } from '../types';

type Channel = 'GOOGLE_ADS' | 'EXHIBITION' | 'REFERRAL' | 'WEBSITE_SEO' | 'SOCIAL_MEDIA' | 'OTHER';
type Status = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

const CHANNEL_META: Record<Channel, { label: string; icon: string; bg: string; fg: string }> = {
  GOOGLE_ADS: { label: 'Google Ads', icon: '◎', bg: '#eaf0fe', fg: '#2f5fe0' },
  EXHIBITION: { label: 'Exhibition', icon: '▦', bg: '#fef3e0', fg: '#b45309' },
  REFERRAL: { label: 'Referral', icon: '✆', bg: '#e9f7ef', fg: '#12803c' },
  WEBSITE_SEO: { label: 'Website SEO', icon: '✦', bg: '#f1edfb', fg: '#6d3fd6' },
  SOCIAL_MEDIA: { label: 'Social Media', icon: '✉', bg: '#fbe9f6', fg: '#b4308f' },
  OTHER: { label: 'Other', icon: '●', bg: '#eef0f4', fg: colors.muted },
};
const CHANNEL_OPTIONS = (Object.keys(CHANNEL_META) as Channel[]).map((value) => ({ value, label: CHANNEL_META[value].label }));
const STATUS_TONE: Record<Status, string> = { ACTIVE: colors.success, PAUSED: colors.warning, COMPLETED: colors.muted };
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  status: Status;
  startDate: string;
  endDate: string | null;
  budget: number;
  spend: number;
  description: string | null;
  leadCount?: number;
}
interface CampaignDetail extends Campaign {
  totalLeads: number;
  wonLeads: number;
  costPerLead: number | null;
  conversionPct: number | null;
  weeklyTrend: Array<{ label: string; count: number }>;
}
interface CampaignLead {
  id: string;
  name: string;
  company: string;
  stage: string;
  value: number;
  createdAt: string;
}

type Tab = 'all' | Status;
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
];

/** Marketing campaigns: spend, leads and conversion by channel — an ad run, exhibition, referral drive or similar. */
export function CampaignsScreen({ navigation }: NativeStackScreenProps<MoreStackParams, 'Campaigns'>) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('marketing.manage');
  const [tab, setTab] = useState<Tab>('all');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage
        ? () => (
            <Pressable onPress={() => navigation.navigate('CampaignForm', {})} hitSlop={12} accessibilityRole="button" accessibilityLabel="Add campaign">
              <Text style={styles.headerBtn}>+ New</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canManage]);

  const list = useQuery({
    queryKey: ['campaigns', 'list', tab, search],
    queryFn: () => api.get<Paginated<Campaign>>('/marketing-campaigns', { status: tab === 'all' ? undefined : tab, search: search || undefined, pageSize: 50 }),
  });
  const items = list.data?.items ?? [];

  return (
    <View style={styles.screen}>
      <Segmented value={tab} options={TABS} onChange={setTab} />
      <View style={styles.searchBox}>
        <TextInput value={input} onChangeText={setInput} placeholder="Search campaigns…" placeholderTextColor={colors.muted} style={styles.search} autoCapitalize="none" accessibilityLabel="Search campaigns" />
      </View>
      {list.isError ? (
        <View style={styles.pad}>
          <ErrorBox message={errorText(list.error, 'Could not load campaigns.')} />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />}>
        {list.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {list.data && items.length === 0 ? <Empty title="No campaigns" hint={canManage ? 'Tap + New to add one.' : undefined} /> : null}
        {items.map((c) => {
          const meta = CHANNEL_META[c.channel];
          return (
            <Pressable key={c.id} style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={() => navigation.navigate('CampaignDetail', { id: c.id, name: c.name })} accessibilityRole="button">
              <View style={styles.row}>
                <View style={styles.channelRow}>
                  <View style={[styles.channelIcon, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.channelGlyph, { color: meta.fg }]}>{meta.icon}</Text>
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
                <Text style={[styles.status, { color: STATUS_TONE[c.status] }]}>{enumLabel(c.status)}</Text>
              </View>
              <Text style={text.muted}>
                {meta.label} · {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : 'ongoing'}
              </Text>
              <View style={styles.row}>
                <Text style={styles.spend}>{formatINR(c.spend)} spent</Text>
                {c.leadCount !== undefined ? <Text style={text.muted}>{c.leadCount} leads</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** One campaign: spend, leads, conversion, and a weekly leads chart — Edit for roles that may. */
export function CampaignDetailScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'CampaignDetail'>) {
  const { id } = route.params;
  const { hasPermission } = useAuth();
  const canManage = hasPermission('marketing.manage');
  const q = useQuery({ queryKey: ['campaigns', 'one', id], queryFn: () => api.get<CampaignDetail>(`/marketing-campaigns/${id}`) });
  const leadsQ = useQuery({ queryKey: ['leads', 'list'], queryFn: () => api.get<{ items: CampaignLead[] }>('/leads') });
  const campaignLeads = (leadsQ.data?.items ?? []).filter((l) => (l as unknown as { campaign?: { id: string } }).campaign?.id === id);
  const c = q.data;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canManage
        ? () => (
            <Pressable onPress={() => navigation.navigate('CampaignForm', { id })} hitSlop={12} accessibilityRole="button" accessibilityLabel="Edit campaign">
              <Text style={styles.headerBtn}>Edit</Text>
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, canManage, id]);

  if (q.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  if (!c)
    return (
      <View style={styles.pad}>
        <ErrorBox message={errorText(q.error, 'Could not load this campaign.')} />
      </View>
    );
  const meta = CHANNEL_META[c.channel];
  const maxWeek = Math.max(1, ...c.weeklyTrend.map((w) => w.count));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Card>
        <View style={styles.row}>
          <View style={styles.channelRow}>
            <View style={[styles.channelIcon, { backgroundColor: meta.bg }]}>
              <Text style={[styles.channelGlyph, { color: meta.fg }]}>{meta.icon}</Text>
            </View>
            <Text style={[text.h1, styles.flex]} numberOfLines={2}>
              {c.name}
            </Text>
          </View>
          <Badge value={c.status} label={enumLabel(c.status)} />
        </View>
        <Text style={text.muted}>
          {meta.label} · {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : 'ongoing'}
        </Text>
        {c.description ? <Text style={[text.body, styles.description]}>{c.description}</Text> : null}
      </Card>

      <View style={styles.statGrid}>
        <Stat label="Total Leads" value={String(c.totalLeads)} />
        <Stat label="Spend" value={formatINR(c.spend)} />
        <Stat label="Cost / Lead" value={c.costPerLead !== null ? formatINR(c.costPerLead) : '—'} />
        <Stat label="Conversion" value={c.conversionPct !== null ? `${c.conversionPct}%` : '—'} tone={c.conversionPct !== null ? colors.success : undefined} />
      </View>

      <Card>
        <Text style={[text.h2, styles.section]}>Leads trend</Text>
        <View style={styles.chart}>
          {c.weeklyTrend.map((w) => (
            <View key={w.label} style={styles.chartCol}>
              <Text style={styles.chartCount}>{w.count}</Text>
              <View style={[styles.chartBar, { height: Math.max(6, (w.count / maxWeek) * 110) }]} />
              <Text style={styles.chartLabel}>{w.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={[text.h2, styles.section]}>Leads from this campaign ({campaignLeads.length})</Text>
        {campaignLeads.length === 0 ? (
          <Empty title="No leads tagged to this campaign yet" />
        ) : (
          campaignLeads.map((l) => (
            <View key={l.id} style={styles.leadRow}>
              <Text style={text.body}>
                {l.name} · {l.company}
              </Text>
              <Text style={text.muted}>
                {l.stage} · {formatINR(l.value)}
              </Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone ? { color: tone } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** Add or edit a campaign — name, channel, dates, budget and spend. */
export function CampaignFormScreen({ route, navigation }: NativeStackScreenProps<MoreStackParams, 'CampaignForm'>) {
  const id = route.params?.id;
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['campaigns', 'list', 'all', ''], queryFn: () => api.get<Paginated<Campaign>>('/marketing-campaigns', { pageSize: 200 }), enabled: !!id });
  const campaign = id ? list.data?.items.find((c) => c.id === id) : undefined;
  if (id && list.isLoading) return <ActivityIndicator color={colors.primary} style={styles.loading} />;

  const [name, setName] = useState(campaign?.name ?? '');
  const [channel, setChannel] = useState<Channel | null>(campaign?.channel ?? 'GOOGLE_ADS');
  const [status, setStatus] = useState<Status>(campaign?.status ?? 'ACTIVE');
  const [startDate, setStartDate] = useState<Date | null>(dayFromIso(campaign?.startDate) ?? new Date());
  const [endDate, setEndDate] = useState<Date | null>(dayFromIso(campaign?.endDate ?? undefined));
  const [budget, setBudget] = useState(String(campaign?.budget ?? ''));
  const [spend, setSpend] = useState(String(campaign?.spend ?? ''));
  const [description, setDescription] = useState(campaign?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const data = {
        name: name.trim(),
        channel,
        status,
        startDate: startDate ? isoDay(startDate) : undefined,
        endDate: endDate ? isoDay(endDate) : null,
        budget: budget.trim() ? Number(budget) : undefined,
        spend: spend.trim() ? Number(spend) : undefined,
        description: description.trim(),
      };
      return campaign ? api.patch(`/marketing-campaigns/${campaign.id}`, data) : api.post('/marketing-campaigns', data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
      navigation.goBack();
    },
    onError: (err) => setError(errorText(err, 'Could not save the campaign.')),
  });

  function submit() {
    if (!name.trim()) return setError('Enter the campaign name.');
    if (!channel) return setError('Choose a channel.');
    if (!startDate) return setError('Choose a start date.');
    setError(null);
    save.mutate();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Card>
        {error ? <ErrorBox message={error} /> : null}
        <Field label="Campaign name *" value={name} onChangeText={setName} maxLength={200} />
        <ChipSelect label="Channel *" value={channel} options={CHANNEL_OPTIONS} onChange={setChannel} />
        <ChipSelect label="Status" value={status} options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'PAUSED', label: 'Paused' }, { value: 'COMPLETED', label: 'Completed' }]} onChange={(v) => v && setStatus(v as Status)} />
        <DateField label="Start date *" value={startDate} onChange={setStartDate} />
        <DateField label="End date" value={endDate} onChange={setEndDate} allowClear />
        <Field label="Budget (₹)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" />
        <Field label="Spend so far (₹)" value={spend} onChangeText={setSpend} keyboardType="decimal-pad" />
        <Field label="Description" value={description} onChangeText={setDescription} multiline maxLength={4000} />
        <Button title={campaign ? 'Save Campaign' : 'Create Campaign'} onPress={submit} loading={save.isPending} />
      </Card>
      {campaign ? (
        <Card>
          <Row label="Leads so far" value={campaign.leadCount !== undefined ? String(campaign.leadCount) : undefined} />
        </Card>
      ) : null}
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
  pressed: { opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, marginBottom: 2 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  channelIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  channelGlyph: { fontSize: 16, fontWeight: '700' },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  status: { fontSize: 12, fontWeight: '700' },
  spend: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  description: { marginTop: space.sm },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.md },
  statCard: { width: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  statLabel: { fontSize: 11.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  section: { marginBottom: space.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 160, paddingTop: space.sm },
  chartCol: { alignItems: 'center', gap: 6, flex: 1 },
  chartCount: { fontSize: 11, fontWeight: '700', color: colors.text },
  chartBar: { width: 24, borderRadius: 6, backgroundColor: colors.primary },
  chartLabel: { fontSize: 11.5, color: colors.muted },
  leadRow: { paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
