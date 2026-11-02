import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PdfButton } from '../components/docParts';
import { Card, Empty, Row, text } from '../components/ui';
import { api } from '../lib/api';
import { formatINR } from '../lib/format';
import { colors, space } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Payslip {
  id: string;
  month: number;
  year: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  status: 'DRAFT' | 'FINALIZED';
}

/** My own payslips — editing salary structures and generating payslips for anyone stays on the web CRM. */
export function PayslipsScreen() {
  const payslips = useQuery({ queryKey: ['payroll', 'payslips'], queryFn: () => api.get<Payslip[]>('/payroll/payslips') });
  const rows = payslips.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={payslips.isRefetching} onRefresh={() => void payslips.refetch()} />}>
      {payslips.isLoading ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
      {!payslips.isLoading && rows.length === 0 ? <Empty title="No payslips yet" /> : null}
      {rows.map((p) => (
        <Card key={p.id}>
          <View style={styles.head}>
            <Text style={text.h2}>{MONTHS[p.month - 1]} {p.year}</Text>
            <Text style={[text.muted, p.status === 'FINALIZED' ? styles.final : undefined]}>{p.status === 'FINALIZED' ? 'Finalized' : 'Draft'}</Text>
          </View>
          <Row label="Gross" value={formatINR(p.grossEarnings)} />
          <Row label="Deductions" value={formatINR(p.totalDeductions)} />
          <Row label="Net Pay" value={formatINR(p.netPay)} />
          <PdfButton path={`/payroll/payslips/${p.id}/pdf`} fileName={`Payslip-${MONTHS[p.month - 1]}-${p.year}`} title={`Payslip — ${MONTHS[p.month - 1]} ${p.year}`} />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  final: { color: colors.success, fontWeight: '700' },
  loading: { padding: space.lg },
});
