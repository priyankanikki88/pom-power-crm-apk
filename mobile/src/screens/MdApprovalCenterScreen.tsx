import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Segmented } from '../components/inputs';
import { Badge, Empty, ErrorBox, text } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/dates';
import { formatINRCompact } from '../lib/format';
import { colors, space } from '../theme';

type DocType = 'ALL' | 'QUOTATION' | 'PROFORMA_INVOICE' | 'FORMAT4' | 'EXPENSE';
const TABS: Array<{ value: DocType; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'PROFORMA_INVOICE', label: 'Proforma' },
  { value: 'FORMAT4', label: 'F-4' },
  { value: 'EXPENSE', label: 'Expense' },
];

interface Item {
  kind: string;
  id: string;
  reference: string;
  customer: string;
  amount: number;
  date: string;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Every document waiting on an approval decision, company-wide — Quotation / Proforma / Format-4 (the document-approval workflow) plus Expense claims (its own, separate approval flow). */
export function MdApprovalCenterScreen() {
  const [tab, setTab] = useState<DocType>('ALL');
  const q = useQuery({ queryKey: ['md', 'approvals', tab], queryFn: () => api.get<Item[]>('/dashboard/md/approvals', tab === 'ALL' ? undefined : { type: tab }) });
  const items = q.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
      <Segmented value={tab} options={TABS} onChange={setTab} />
      {q.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {q.isError ? <ErrorBox message={errorText(q.error, 'Could not load pending approvals.')} /> : null}
      {q.data && items.length === 0 ? <Empty title="Nothing pending approval" /> : null}
      {items.map((it) => (
        <View key={`${it.kind}-${it.id}`} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.reference}>{it.reference}</Text>
              <Text style={text.muted}>{it.customer}</Text>
            </View>
            <Badge value="PENDING" label="Pending" />
          </View>
          <View style={styles.row}>
            <Text style={styles.kind}>{it.kind}</Text>
            <Text style={styles.amount}>{formatINRCompact(it.amount)}</Text>
          </View>
          <Text style={styles.date}>{formatDate(it.date)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  loading: { padding: space.lg },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  flex: { flex: 1 },
  reference: { fontSize: 14, fontWeight: '700', color: colors.text },
  kind: { fontSize: 11.5, color: colors.muted, fontWeight: '600', textTransform: 'uppercase' },
  amount: { fontSize: 14, fontWeight: '800', color: colors.text },
  date: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
});
