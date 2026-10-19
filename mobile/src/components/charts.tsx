import { StyleSheet, Text, View } from 'react-native';
import { formatINRCompact } from '../lib/format';
import { colors, radius, space } from '../theme';

/** A simple horizontal labelled bar list — the MD/CEO screens' own chart, since this app has no chart library on mobile (the web app's equivalent is StageBars). */
export function Bars({ rows, money, color }: { rows: Array<{ key: string; label: string; value: number }>; money?: boolean; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <View style={styles.wrap}>
      {rows.map((r) => (
        <View key={r.key} style={styles.row}>
          <Text style={styles.label} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(Math.abs(r.value) / max) * 100}%`, backgroundColor: color ?? colors.primary }]} />
          </View>
          <Text style={styles.value}>{money ? formatINRCompact(r.value) : r.value.toLocaleString('en-IN')}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { width: 88, fontSize: 12.5, color: colors.text },
  track: { flex: 1, height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  value: { width: 70, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: colors.text },
});
