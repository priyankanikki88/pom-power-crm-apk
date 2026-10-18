import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SalesTopBar } from '../components/SalesTopBar';
import { currentQuarterKey, financialYearOf, recentFinancialYears, type FinancialYear, type QuarterKey } from '../lib/financialYear';
import {
  useLiveCustomerCount,
  useLivePendingFollowUps,
  useQuarterDocuments,
  useQuarterLeads,
  useQuarterSales,
  useQuarterTargets,
  type MonthPoint,
} from '../lib/salesDashboard';
import { brand, colors, radius, space } from '../theme';

const wholeINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const BAR_COLORS = ['#7fb8f0', brand.blue, '#2fb787'];

function SalesChart({ points }: { points: MonthPoint[] }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <View style={styles.chart}>
      {points.map((p, i) => {
        const h = p.value > 0 ? Math.max((p.value / max) * 130, 10) : 2;
        return (
          <View key={`${i}-${p.label}`} style={styles.chartCol}>
            <Text style={styles.chartAmount} numberOfLines={1}>
              {wholeINR(p.value)}
            </Text>
            <View style={[styles.chartBar, { height: h, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }]} />
            <Text style={styles.chartMonth}>{p.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CardShell({ icon, bg, fg, label, onPress, children }: { icon: string; bg: string; fg: string; label: string; onPress?: () => void; children: ReactNode }) {
  return (
    <Pressable style={styles.statCard} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: bg }]}>
          <Text style={[styles.cardGlyph, { color: fg }]}>{icon}</Text>
        </View>
        {onPress ? <Text style={styles.cardChevron}>›</Text> : null}
      </View>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </Pressable>
  );
}

function CountValueCard(props: { icon: string; bg: string; fg: string; label: string; count?: number; value?: number; onPress?: () => void }) {
  return (
    <CardShell icon={props.icon} bg={props.bg} fg={props.fg} label={props.label} onPress={props.onPress}>
      {props.count !== undefined ? (
        <>
          <Text style={styles.cardSub}>Number</Text>
          <Text style={styles.cardNum}>{props.count.toLocaleString('en-IN')}</Text>
        </>
      ) : null}
      {props.value !== undefined ? (
        <>
          <Text style={styles.cardSub}>Total Value</Text>
          <Text style={styles.cardValue} numberOfLines={1}>
            {wholeINR(props.value)}
          </Text>
        </>
      ) : null}
    </CardShell>
  );
}

function ProgressCard(props: { icon: string; bg: string; fg: string; label: string; value: number; pct: number | null; onPress?: () => void }) {
  const pct = Math.min(100, Math.max(0, props.pct ?? 0));
  return (
    <CardShell icon={props.icon} bg={props.bg} fg={props.fg} label={props.label} onPress={props.onPress}>
      <Text style={styles.cardValue} numberOfLines={1}>
        {wholeINR(props.value)}
      </Text>
      <Text style={[styles.cardPct, { color: props.fg }]}>{props.pct === null ? '—' : `${props.pct}%`}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: props.fg }]} />
      </View>
    </CardShell>
  );
}

/**
 * The Sales Person Dashboard — total sales for the selected quarter (chart), and leads / customers / documents /
 * targets for the same period. See lib/salesDashboard.ts for exactly what each figure is (and isn't) scoped to.
 */
export function SalesDashboardScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const [fy, setFy] = useState<FinancialYear>(() => financialYearOf(new Date()));
  const [quarterKey, setQuarterKey] = useState<QuarterKey>(() => currentQuarterKey());
  const [fyOpen, setFyOpen] = useState(false);
  const quarter = fy.quarters.find((q) => q.key === quarterKey)!;
  const fyOptions = recentFinancialYears(3);

  const sales = useQuarterSales(quarter);
  const docs = useQuarterDocuments(quarter);
  const leads = useQuarterLeads(quarter);
  const customers = useLiveCustomerCount();
  const followUps = useLivePendingFollowUps();
  const targets = useQuarterTargets(quarter);

  const refreshing = sales.isRefetching || docs.isRefetching || leads.isRefetching || customers.isRefetching || followUps.isRefetching || targets.isRefetching;
  function refresh() {
    void sales.refetch();
    void docs.refetch();
    void leads.refetch();
    void customers.refetch();
    void followUps.refetch();
    void targets.refetch();
  }

  const goFollowUps = () => navigation.navigate('FollowUps', { screen: 'FollowUpList' });

  return (
    <View style={styles.screen}>
      <SalesTopBar active="home" />
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={styles.card}>
          <View style={styles.headRow}>
            <Text style={styles.title}>Total Sales</Text>
            <Pressable style={styles.fyBox} onPress={() => setFyOpen(true)} accessibilityRole="button" accessibilityLabel="Choose financial year">
              <Text style={styles.fyText}>{fy.label}</Text>
              <Text style={styles.fyChevron}>⌄</Text>
            </Pressable>
          </View>

          <View style={styles.qRow}>
            {fy.quarters.map((q) => {
              const active = q.key === quarterKey;
              return (
                <Pressable key={q.key} style={[styles.qTab, active && styles.qTabActive]} onPress={() => setQuarterKey(q.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
                  <Text style={[styles.qTabText, active && styles.qTabTextActive]}>{q.key}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.qRange}>{quarter.label}</Text>

          {sales.isLoading ? <ActivityIndicator color={brand.blue} style={{ padding: space.lg }} /> : null}
          {sales.data ? (
            <>
              <Text style={styles.total}>
                {wholeINR(sales.data.total)} <Text style={styles.totalLabel}>Total Sales</Text>
              </Text>
              <SalesChart points={sales.data.points} />
            </>
          ) : null}
        </View>

        <View style={styles.grid}>
          <CountValueCard icon="✦" bg="#eaf0fe" fg="#2f5fe0" label="Total Leads" count={leads.data?.count} value={leads.data?.value} onPress={() => navigation.navigate('Leads')} />
          <CountValueCard icon="◉" bg="#e9f7ef" fg="#12803c" label="Total Customers" count={customers.data} onPress={() => navigation.navigate('CustomerList')} />
          <CountValueCard icon="✆" bg="#fef3e0" fg="#b45309" label="Follow-up Pending" count={followUps.data} onPress={goFollowUps} />

          <CountValueCard icon="▤" bg="#f1edfb" fg="#6d3fd6" label="Total Quotes" count={docs.data?.quotations.count} value={docs.data?.quotations.value} onPress={() => navigation.navigate('QuotationList')} />
          <CountValueCard icon="▥" bg="#e9f7ef" fg="#12803c" label="Total Proforma" count={docs.data?.proforma.count} value={docs.data?.proforma.value} onPress={() => navigation.navigate('QuotationList')} />
          <CountValueCard icon="▦" bg="#eaf0fe" fg="#2f5fe0" label="Total Format-4" count={docs.data?.format4.count} value={docs.data?.format4.value} onPress={() => navigation.navigate('QuotationList')} />

          <CountValueCard icon="◎" bg="#fef3e0" fg="#b45309" label="Total Target" count={targets.data ? 1 : undefined} value={targets.data?.amount} onPress={() => navigation.navigate('Targets')} />
          <ProgressCard icon="✓" bg="#eaf0fe" fg={brand.blue} label="Achieved Target" value={targets.data?.achieved ?? 0} pct={targets.data?.achievedPct ?? null} onPress={() => navigation.navigate('Targets')} />
          <ProgressCard icon="◷" bg="#fdeaec" fg={brand.red} label="Pending Target" value={targets.data?.pending ?? 0} pct={targets.data?.pendingPct ?? null} onPress={() => navigation.navigate('Targets')} />
        </View>
      </ScrollView>

      <Modal transparent visible={fyOpen} animationType="fade" onRequestClose={() => setFyOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFyOpen(false)}>
          <View style={styles.modalSheet}>
            {fyOptions.map((f) => (
              <Pressable
                key={f.startYear}
                style={styles.modalItem}
                onPress={() => {
                  setFy(f);
                  setFyOpen(false);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.modalItemText, f.startYear === fy.startYear && styles.modalItemTextOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  fyBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  fyText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  fyChevron: { fontSize: 13, color: colors.muted },
  qRow: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  qTab: { flex: 1, minHeight: 38, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  qTabActive: { backgroundColor: brand.blue },
  qTabText: { fontSize: 13.5, fontWeight: '700', color: colors.muted },
  qTabTextActive: { color: '#ffffff' },
  qRange: { fontSize: 12.5, color: colors.muted, marginBottom: space.md },
  total: { fontSize: 26, fontWeight: '800', color: brand.blue, marginBottom: space.md },
  totalLabel: { fontSize: 14, fontWeight: '600', color: colors.muted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 190, paddingTop: space.sm },
  chartCol: { alignItems: 'center', gap: 6, flex: 1 },
  chartAmount: { fontSize: 10.5, fontWeight: '700', color: colors.text },
  chartBar: { width: 34, borderRadius: 6 },
  chartMonth: { fontSize: 12, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  statCard: { width: '31%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardGlyph: { fontSize: 16, fontWeight: '700' },
  cardChevron: { fontSize: 18, color: colors.muted },
  cardLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: space.sm },
  cardSub: { fontSize: 11, color: colors.muted, marginTop: space.sm },
  cardNum: { fontSize: 18, fontWeight: '800', color: colors.text },
  cardValue: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: space.sm },
  cardPct: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  track: { height: 7, borderRadius: 999, backgroundColor: colors.bg, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 999 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', padding: space.xl },
  modalSheet: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  modalItem: { paddingVertical: 14, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalItemText: { fontSize: 15, color: colors.text },
  modalItemTextOn: { fontWeight: '800', color: brand.blue },
});
