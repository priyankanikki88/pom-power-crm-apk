import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space } from '../theme';

/** One-of-many as tappable chips (wraps onto more lines) — used where the web CRM has a <select>. */
export function ChipSelect<T extends string>({ label, value, options, onChange, allowClear }: { label: string; value: T | null; options: Array<{ value: T; label: string }>; onChange: (v: T | null) => void; allowClear?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(on && allowClear ? null : o.value)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A horizontally scrolling tab strip for list filters (Today / Overdue / …). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.seg, on && styles.segOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Date and time, each opened with the system picker. */
export function DateTimeField({ label, value, onChange, minimumDate }: { label: string; value: Date; onChange: (d: Date) => void; minimumDate?: Date }) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dtRow}>
        <Pressable style={styles.dtBox} onPress={() => setMode('date')} accessibilityRole="button" accessibilityLabel={`${label}, date`}>
          <Text style={styles.dtText}>{value.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</Text>
        </Pressable>
        <Pressable style={[styles.dtBox, styles.dtTime]} onPress={() => setMode('time')} accessibilityRole="button" accessibilityLabel={`${label}, time`}>
          <Text style={styles.dtText}>{value.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>
        </Pressable>
      </View>
      {mode ? (
        <DateTimePicker
          value={value}
          mode={mode}
          minimumDate={mode === 'date' ? minimumDate : undefined}
          display={Platform.OS === 'android' ? 'default' : 'spinner'}
          onChange={(event, picked) => {
            setMode(null);
            if (event.type !== 'dismissed' && picked) onChange(picked);
          }}
        />
      ) : null}
    </View>
  );
}

/** A date only (no time), opened with the system calendar. `allowClear` adds a way back to "not set". */
export function DateField({ label, value, onChange, minimumDate, maximumDate, allowClear }: { label: string; value: Date | null; onChange: (d: Date | null) => void; minimumDate?: Date; maximumDate?: Date; allowClear?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dtRow}>
        <Pressable style={styles.dtBox} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
          <Text style={[styles.dtText, !value && styles.dtEmpty]}>{value ? value.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set — tap to choose'}</Text>
        </Pressable>
        {allowClear && value ? (
          <Pressable style={[styles.dtBox, styles.dtClear]} onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <Text style={styles.dtText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          display={Platform.OS === 'android' ? 'default' : 'spinner'}
          onChange={(event, picked) => {
            setOpen(false);
            if (event.type !== 'dismissed' && picked) onChange(picked);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13.5, color: colors.text },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  segmented: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  seg: { minHeight: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  segOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  segTextOn: { color: '#fff' },
  dtRow: { flexDirection: 'row', gap: space.sm },
  dtBox: { flex: 2, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, justifyContent: 'center', backgroundColor: colors.surface },
  dtTime: { flex: 1 },
  dtText: { fontSize: 15, color: colors.text },
  dtEmpty: { color: colors.muted },
  dtClear: { flex: 0, paddingHorizontal: space.lg },
});
