import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '../components/inputs';
import { Badge, Button, Empty, ErrorBox } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { colors, radius, space } from '../theme';

interface Engineer {
  id: string;
  name: string;
  phone: string | null;
  territory: string | null;
  active: boolean;
  _count: { serviceTickets: number; installations: number };
}

type Tab = 'all' | 'active' | 'inactive';
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

/** Every service engineer and their current open-job load. "On Visit" / "On Leave" from the mockup aren't a stored status on this model — Active/Inactive is what this app actually tracks. */
export function ServiceHeadTechTeamScreen() {
  const [tab, setTab] = useState<Tab>('all');
  const q = useQuery({ queryKey: ['service-head', 'tech-team', tab], queryFn: () => api.get<Engineer[]>('/service-engineers', tab === 'all' ? undefined : { active: tab === 'active' ? 'true' : 'false' }) });
  const engineers = q.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Segmented value={tab} options={TABS} onChange={setTab} />
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load the technician list.')} /> : null}
      {q.data && engineers.length === 0 ? <Empty title="No technicians" /> : null}
      {engineers.map((e) => (
        <View key={e.id} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.name}>{e.name}</Text>
              {e.territory ? <Text style={styles.territory}>{e.territory}</Text> : null}
            </View>
            <Badge value={e.active ? 'ACTIVE' : 'INACTIVE'} label={e.active ? 'Active' : 'Inactive'} />
          </View>
          <Text style={styles.load}>{e._count.serviceTickets} open ticket{e._count.serviceTickets === 1 ? '' : 's'}</Text>
          {e.phone ? (
            <View style={styles.actions}>
              <Button title="Call" variant="secondary" onPress={() => void Linking.openURL(`tel:${digits(e.phone!)}`)} />
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  territory: { fontSize: 12, color: colors.muted, marginTop: 2 },
  load: { fontSize: 12, color: colors.text, marginTop: 6 },
  actions: { marginTop: space.sm, flexDirection: 'row' },
});
