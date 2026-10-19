import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Empty, ErrorBox } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatWhen } from '../lib/dates';
import { colors, radius, space } from '../theme';
import type { TicketSummary } from '../types';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Every ticket with an upcoming or current visit date, soonest first — the Visits tab / Service Calendar. */
export function ServiceHeadVisitsScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const q = useQuery({ queryKey: ['service-head', 'visits'], queryFn: () => api.get<TicketSummary[]>('/service-tickets/visits/upcoming') });
  const visits = q.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load scheduled visits.')} /> : null}
      {q.data && visits.length === 0 ? <Empty title="No visits scheduled" hint="Schedule a visit date when assigning a ticket to an engineer." /> : null}
      {visits.map((t) => (
        <Pressable key={t.id} style={styles.card} onPress={() => navigation.navigate('Tickets', { screen: 'TicketDetail', params: { id: t.id, no: t.ticketNo } })} accessibilityRole="button">
          <View style={styles.row}>
            <Text style={styles.ticketNo}>{t.ticketNo}</Text>
            <Badge value={t.status} label={t.status.replace(/_/g, ' ')} />
          </View>
          <Text style={styles.customer}>{t.customer.name}</Text>
          {t.assignedEngineer ? <Text style={styles.engineer}>{t.assignedEngineer.name}</Text> : null}
          {t.scheduledAt ? <Text style={styles.when}>{formatWhen(t.scheduledAt)}</Text> : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  ticketNo: { fontSize: 14, fontWeight: '700', color: colors.text },
  customer: { fontSize: 13, color: colors.text },
  engineer: { fontSize: 12, color: colors.muted, marginTop: 2 },
  when: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 4 },
});
