import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '../theme';

const ITEMS: Array<{ screen: string; glyph: string; title: string; hint: string }> = [
  { screen: 'MdSalesReport', glyph: '📈', title: 'Sales Report', hint: 'Monthly, Quarterly, Branch and Zone' },
  { screen: 'MdTopEmployees', glyph: '🏆', title: 'Top 5 Employees', hint: 'Ranked by actual revenue' },
  { screen: 'MdTargetAchievement', glyph: '🎯', title: 'Target Achievement', hint: 'By Branch, Zone or Employee' },
  { screen: 'MdPipeline', glyph: '🔻', title: 'Sales Pipeline', hint: 'Leads → Quotation → Proforma → Format-4' },
];

/** The Reports tab's own landing page — one menu to the four MD/CEO sales-analytics screens. */
export function MdReportsMenuScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      {ITEMS.map((it) => (
        <Pressable key={it.screen} style={styles.row} onPress={() => navigation.navigate(it.screen)} accessibilityRole="button">
          <Text style={styles.glyph}>{it.glyph}</Text>
          <View style={styles.flex}>
            <Text style={styles.title}>{it.title}</Text>
            <Text style={styles.hint}>{it.hint}</Text>
          </View>
          <Text style={styles.arrow}>{'›'}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  glyph: { fontSize: 22 },
  flex: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  arrow: { fontSize: 20, color: colors.muted },
});
