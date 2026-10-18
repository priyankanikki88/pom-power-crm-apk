import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SalesTopBar } from '../components/SalesTopBar';
import { colors, radius, space } from '../theme';
import { OutboxBanner } from './OutboxScreen';

interface Tile {
  key: string;
  label: string;
  icon: string;
  bg: string;
  fg: string;
  onPress: (navigation: NavigationProp<Record<string, object | undefined>>) => void;
}

const TILES: Tile[] = [
  { key: 'lead', label: 'Lead', icon: '✦', bg: '#eaf0fe', fg: '#2f5fe0', onPress: (n) => n.navigate('Leads') },
  { key: 'followup', label: 'Follow-up', icon: '✆', bg: '#e9f7ef', fg: '#12803c', onPress: (n) => n.navigate('FollowUps', { screen: 'FollowUpList' }) },
  { key: 'customer', label: 'Customer', icon: '◉', bg: '#fef3e0', fg: '#b45309', onPress: (n) => n.navigate('CustomerList') },
  { key: 'quotation', label: 'Quotation', icon: '▤', bg: '#f1edfb', fg: '#6d3fd6', onPress: (n) => n.navigate('QuotationList') },
  { key: 'proforma', label: 'Proforma', icon: '▥', bg: '#e9f7ef', fg: '#12803c', onPress: (n) => n.navigate('QuotationList') },
  { key: 'format4', label: 'F-4', icon: '▦', bg: '#fdeded', fg: '#d92d20', onPress: (n) => n.navigate('QuotationList') },
  { key: 'expenses', label: 'Expenses', icon: '$', bg: '#fef3e0', fg: '#b45309', onPress: (n) => n.navigate('Expenses') },
  { key: 'report', label: 'Report', icon: '▣', bg: '#eaf0fe', fg: '#2f5fe0', onPress: (n) => n.navigate('Reports') },
  { key: 'chat', label: 'Chat', icon: '✉', bg: '#fbe9f6', fg: '#b4308f', onPress: (n) => n.navigate('Chat') },
  { key: 'target', label: 'Target', icon: '◎', bg: '#e9f7ef', fg: '#12803c', onPress: (n) => n.navigate('Targets') },
  { key: 'tour', label: 'Tour Plan', icon: '⚑', bg: '#f1edfb', fg: '#6d3fd6', onPress: (n) => n.navigate('Tours') },
  { key: 'complaint', label: 'Complaint', icon: '!', bg: '#fdeded', fg: '#d92d20', onPress: (n) => n.navigate('Service', { screen: 'TicketForm' }) },
];

/** The Sales Person's Home / landing screen — one tap to every sales & service action, plus a way into the Sales Dashboard. */
export function SalesHomeScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();

  return (
    <View style={styles.screen}>
      <SalesTopBar active="home" />
      <ScrollView contentContainerStyle={styles.body}>
        <OutboxBanner />
        <Pressable style={styles.dashboardCard} onPress={() => navigation.navigate('SalesDashboard')} accessibilityRole="button">
          <View>
            <Text style={styles.dashboardTitle}>Sales Dashboard</Text>
            <Text style={styles.dashboardHint}>Sales, leads, documents & targets — by quarter</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <View style={styles.grid}>
          {TILES.map((t) => (
            <Pressable key={t.key} style={styles.tile} onPress={() => t.onPress(navigation)} accessibilityRole="button" accessibilityLabel={t.label}>
              <View style={[styles.tileIcon, { backgroundColor: t.bg }]}>
                <Text style={[styles.tileGlyph, { color: t.fg }]}>{t.icon}</Text>
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, paddingBottom: space.xl },
  dashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.lg,
  },
  dashboardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  dashboardHint: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  // 3 columns with a gap between them: 31% left too little room for the gaps on narrower phones and wrapped unevenly.
  tile: { width: '30%', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: space.lg },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  tileGlyph: { fontSize: 22, fontWeight: '700' },
  tileLabel: { fontSize: 12.5, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
