import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge, Empty, ErrorBox } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { formatINRCompact } from '../lib/format';
import { colors, radius, space } from '../theme';

interface Item {
  id: string;
  reference: string;
  employee: string;
  amount: number;
  date: string;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Expense claims waiting on a decision — leave requests already have their own approval queue, the existing Leave tab. */
export function HrApprovalsScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const q = useQuery({ queryKey: ['hr', 'approvals'], queryFn: () => api.get<Item[]>('/users/hr/approvals') });
  const items = q.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load pending approvals.')} /> : null}
      {q.data && items.length === 0 ? <Empty title="Nothing pending approval" /> : null}
      {items.map((it) => (
        <Pressable key={it.id} style={styles.card} onPress={() => navigation.navigate('More', { screen: 'ExpenseDetail', params: { id: it.id, no: it.reference } })} accessibilityRole="button">
          <View style={styles.row}>
            <Text style={styles.reference}>{it.reference}</Text>
            <Badge value="PENDING" label="Pending" />
          </View>
          <Text style={styles.detail}>{it.employee}</Text>
          <View style={styles.row}>
            <Text style={styles.amount}>{formatINRCompact(it.amount)}</Text>
            <Text style={styles.date}>{formatDate(it.date)}</Text>
          </View>
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
  reference: { fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { fontSize: 12.5, color: colors.text, marginBottom: 4 },
  amount: { fontSize: 14, fontWeight: '800', color: colors.text },
  date: { fontSize: 11.5, color: colors.muted },
});
