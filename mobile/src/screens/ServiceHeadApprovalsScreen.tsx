import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Empty, ErrorBox } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { colors, radius, space } from '../theme';

interface Item {
  kind: 'Spare Part' | 'Expense';
  id: string;
  reference: string;
  detail: string;
  date: string;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Spare part requests and expense claims waiting on a decision. An expense claim opens where its own approve/reject action lives; spare part requests are shown here read-only (there is no company-wide request screen to open them into yet — act on them from the ticket's own Spare Parts tab). */
export function ServiceHeadApprovalsScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const q = useQuery({ queryKey: ['service-head', 'approvals'], queryFn: () => api.get<Item[]>('/service/head/approvals') });
  const items = q.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load pending approvals.')} /> : null}
      {q.data && items.length === 0 ? <Empty title="Nothing pending approval" /> : null}
      {items.map((it) => {
        const openable = it.kind === 'Expense';
        return (
          <Pressable
            key={`${it.kind}-${it.id}`}
            style={styles.card}
            disabled={!openable}
            onPress={openable ? () => navigation.navigate('More', { screen: 'ExpenseDetail', params: { id: it.id, no: it.reference } }) : undefined}
            accessibilityRole={openable ? 'button' : undefined}
          >
            <View style={styles.row}>
              <Text style={styles.reference}>{it.reference}</Text>
              <Badge value="PENDING" label="Pending" />
            </View>
            <Text style={styles.detail}>{it.detail}</Text>
            <View style={styles.row}>
              <Text style={styles.kind}>{it.kind}</Text>
              <Text style={styles.date}>{formatDate(it.date)}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  reference: { fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { fontSize: 12.5, color: colors.text, marginBottom: 4 },
  kind: { fontSize: 11, color: colors.muted, fontWeight: '600', textTransform: 'uppercase' },
  date: { fontSize: 11.5, color: colors.muted },
});
