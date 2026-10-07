import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, space } from '../theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; loading?: boolean }) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off) }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, variant === 'secondary' && styles.btnSecondary, variant === 'danger' && styles.btnDanger, off && styles.btnOff, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={variant === 'secondary' ? colors.primary : '#fff'} /> : <Text style={[styles.btnText, variant === 'secondary' && styles.btnTextSecondary]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} accessibilityLabel={label} {...input} />
    </View>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
    </View>
  );
}

const BADGE: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: colors.successSoft, fg: colors.success },
  PROSPECT: { bg: colors.primarySoft, fg: colors.primaryDark },
  INACTIVE: { bg: '#eef0f4', fg: colors.muted },
  BLOCKED: { bg: colors.dangerSoft, fg: colors.danger },
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const tone = BADGE[value] ?? { bg: '#eef0f4', fg: colors.muted };
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{label ?? value}</Text>
    </View>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? <Text style={styles.rowValue}>{value}</Text> : <View style={styles.rowValueBox}>{value}</View>}
    </View>
  );
}

export const text = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700', color: colors.text },
  h2: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, marginBottom: space.md },
  btn: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: colors.danger },
  btnOff: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnTextSecondary: { color: colors.primary },
  field: { marginBottom: space.md },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: space.xs },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  errorText: { color: colors.danger, fontSize: 14 },
  empty: { alignItems: 'center', padding: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space.xs, textAlign: 'center' },
  muted: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11.5, fontWeight: '700' },
  row: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { flex: 2, fontSize: 13, color: colors.muted },
  rowValue: { flex: 3, fontSize: 14, color: colors.text },
  rowValueBox: { flex: 3 },
});
